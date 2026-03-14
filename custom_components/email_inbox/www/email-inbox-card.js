/**
 * email-inbox-card  v2.0.0
 * Full-width horizontal card showing unread emails only.
 * Click any email to open a full popup reader.
 * Delete and mark-as-read buttons on each tile and in the popup.
 */

const CARD_VERSION = "2.0.0";

// ── Utility ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d), now = new Date(), diff = now - dt;
    if (diff < 86400000 && dt.getDate() === now.getDate())
      return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 7 * 86400000)
      return dt.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch { return String(d).slice(0, 10); }
}

function senderName(from) {
  if (!from) return "Unknown";
  const m = from.match(/^"?([^"<]+?)"?\s*(?:<.*>)?$/);
  return (m ? m[1] : from.split("@")[0]).trim();
}

function senderEmail(from) {
  const m = String(from ?? "").match(/<([^>]+)>/);
  return m ? m[1] : from;
}

function initials(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(name) {
  const colors = ["#6366f1","#8b5cf6","#ec4899","#ef4444","#f97316",
                  "#eab308","#22c55e","#14b8a6","#3b82f6","#06b6d4"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

// ── Icons ────────────────────────────────────────────────────────────────────
const ICO = {
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
  trash:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  read:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  close:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  inbox:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" dur="0.8s" repeatCount="indefinite" from="0 12 12" to="360 12 12"/></circle></svg>`,
  external:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
};

// ── Styles ───────────────────────────────────────────────────────────────────
const STYLES = `
  :host { display: block;
    --bg:       var(--ha-card-background, var(--card-background-color, #fff));
    --primary:  var(--primary-color, #03a9f4);
    --txt1:     var(--primary-text-color, #1e293b);
    --txt2:     var(--secondary-text-color, #64748b);
    --divider:  var(--divider-color, #e2e8f0);
    --danger:   #ef4444;
    --accent:   var(--accent-color, #6366f1);
    --radius:   var(--ha-card-border-radius, 12px);
  }
  ha-card { overflow: visible; }

  /* ── Header ── */
  .hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--divider);
  }
  .hdr-left { display: flex; align-items: center; gap: 10px; }
  .hdr h2 { margin: 0; font-size: .95rem; font-weight: 700; color: var(--txt1); }
  .badge {
    background: var(--accent); color: #fff;
    border-radius: 20px; padding: 2px 9px;
    font-size: .7rem; font-weight: 700; min-width: 22px; text-align: center;
  }
  .badge.zero { background: var(--divider); color: var(--txt2); }
  .acct { font-size: .72rem; color: var(--txt2); }
  .hdr-right { display: flex; gap: 6px; }
  .icon-btn {
    background: none; border: none; cursor: pointer; padding: 6px;
    border-radius: 8px; color: var(--txt2); display: flex; align-items: center;
    transition: background .15s, color .15s;
  }
  .icon-btn:hover { background: rgba(99,102,241,.1); color: var(--accent); }
  .icon-btn svg { width: 16px; height: 16px; }

  /* ── Horizontal scroll strip ── */
  .strip-wrap {
    overflow-x: auto; overflow-y: hidden;
    display: flex; align-items: stretch;
    padding: 14px 18px 16px; gap: 14px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--divider) transparent;
  }
  .strip-wrap::-webkit-scrollbar { height: 4px; }
  .strip-wrap::-webkit-scrollbar-track { background: transparent; }
  .strip-wrap::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 4px; }

  /* ── Email tile ── */
  .tile {
    flex: 0 0 260px; scroll-snap-align: start;
    background: var(--bg);
    border: 1px solid var(--divider);
    border-left: 3px solid var(--accent);
    border-radius: 10px;
    padding: 14px;
    cursor: pointer;
    transition: transform .15s, box-shadow .15s, border-color .15s;
    display: flex; flex-direction: column; gap: 8px;
    position: relative;
    min-height: 130px;
  }
  .tile:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.1); border-color: var(--accent); }

  .tile-top { display: flex; align-items: center; gap: 10px; }
  .avatar {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: .75rem; font-weight: 700; color: #fff; letter-spacing: .03em;
  }
  .tile-meta { flex: 1; min-width: 0; }
  .tile-sender {
    font-size: .82rem; font-weight: 700; color: var(--txt1);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tile-date { font-size: .68rem; color: var(--txt2); margin-top: 1px; }
  .tile-subject {
    font-size: .82rem; color: var(--txt1); font-weight: 600;
    overflow: hidden; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    line-height: 1.35;
  }
  .tile-snippet {
    font-size: .76rem; color: var(--txt2); flex: 1;
    overflow: hidden; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    line-height: 1.4;
  }
  .tile-actions {
    display: flex; gap: 6px; margin-top: auto; padding-top: 6px;
    border-top: 1px solid var(--divider);
  }
  .tile-btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
    font-size: .72rem; font-weight: 600; padding: 5px 8px;
    border: none; border-radius: 6px; cursor: pointer;
    transition: background .15s, color .15s;
  }
  .tile-btn svg { width: 13px; height: 13px; flex-shrink: 0; }
  .tile-btn.btn-read { background: rgba(99,102,241,.1); color: var(--accent); }
  .tile-btn.btn-read:hover { background: rgba(99,102,241,.2); }
  .tile-btn.btn-del  { background: rgba(239,68,68,.08); color: var(--danger); }
  .tile-btn.btn-del:hover  { background: rgba(239,68,68,.18); }
  .tile-btn:disabled { opacity: .4; pointer-events: none; }

  /* ── Empty / Error states ── */
  .empty {
    width: 100%; text-align: center; padding: 28px 20px;
    color: var(--txt2); font-size: .88rem;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .empty svg { width: 40px; height: 40px; opacity: .3; }
  .err-bar {
    margin: 8px 18px; padding: 10px 14px; border-radius: 8px;
    background: rgba(239,68,68,.08); border-left: 3px solid var(--danger);
    font-size: .8rem; color: var(--danger);
  }

  /* ── Popup overlay ── */
  .popup-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: fadeIn .15s ease;
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  .popup {
    background: var(--bg);
    border-radius: 16px;
    width: 100%; max-width: 720px;
    max-height: 85vh;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 60px rgba(0,0,0,.25);
    overflow: hidden;
    animation: slideUp .18s ease;
  }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

  .popup-hdr {
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--divider);
    display: flex; align-items: flex-start; gap: 14px;
  }
  .popup-avatar {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: .9rem; font-weight: 700; color: #fff;
  }
  .popup-hdr-info { flex: 1; min-width: 0; }
  .popup-subject {
    font-size: 1rem; font-weight: 700; color: var(--txt1);
    margin: 0 0 4px; line-height: 1.3;
    word-break: break-word;
  }
  .popup-from { font-size: .8rem; color: var(--txt2); }
  .popup-from strong { color: var(--txt1); font-weight: 600; }
  .popup-date { font-size: .75rem; color: var(--txt2); margin-top: 3px; }

  .popup-hdr-actions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .popup-action-btn {
    display: flex; align-items: center; gap: 5px;
    font-size: .78rem; font-weight: 600; padding: 7px 13px;
    border: none; border-radius: 8px; cursor: pointer;
    transition: background .15s;
  }
  .popup-action-btn svg { width: 14px; height: 14px; }
  .popup-action-btn.btn-read { background: rgba(99,102,241,.12); color: var(--accent); }
  .popup-action-btn.btn-read:hover { background: rgba(99,102,241,.22); }
  .popup-action-btn.btn-del  { background: rgba(239,68,68,.1); color: var(--danger); }
  .popup-action-btn.btn-del:hover  { background: rgba(239,68,68,.2); }
  .popup-action-btn.btn-close { background: var(--divider); color: var(--txt1); }
  .popup-action-btn.btn-close:hover { background: #cbd5e1; }
  .popup-action-btn:disabled { opacity: .4; pointer-events: none; }

  .popup-body {
    flex: 1; overflow-y: auto; padding: 20px;
    font-size: .88rem; line-height: 1.65; color: var(--txt1);
  }
  .popup-body iframe {
    width: 100%; border: none; border-radius: 8px;
    min-height: 300px; background: #fff;
  }
  .popup-body .plain-body {
    white-space: pre-wrap; word-break: break-word;
    font-family: inherit; color: var(--txt1);
  }
  .popup-loading {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: 48px; color: var(--txt2); font-size: .88rem;
  }
  .popup-loading svg { width: 28px; height: 28px; color: var(--accent); }
  .popup-err { color: var(--danger); padding: 24px; text-align: center; font-size: .85rem; }

  /* ── Confirm delete overlay ── */
  .confirm-overlay {
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(0,0,0,.6);
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .confirm-box {
    background: var(--bg); border-radius: 14px; padding: 28px 24px;
    max-width: 340px; width: 100%; text-align: center;
    box-shadow: 0 16px 48px rgba(0,0,0,.25);
  }
  .confirm-box h3 { margin: 0 0 8px; font-size: .95rem; color: var(--txt1); }
  .confirm-box p  { margin: 0 0 20px; font-size: .82rem; color: var(--txt2); }
  .confirm-preview {
    font-size: .8rem; font-weight: 600; color: var(--txt1);
    background: var(--divider); border-radius: 6px; padding: 8px 12px;
    margin-bottom: 20px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }
  .confirm-actions { display: flex; gap: 10px; }
  .confirm-btn {
    flex: 1; padding: 10px; border: none; border-radius: 8px; cursor: pointer;
    font-size: .85rem; font-weight: 600; transition: opacity .15s;
  }
  .confirm-btn:hover { opacity: .85; }
  .confirm-btn.cancel { background: var(--divider); color: var(--txt1); }
  .confirm-btn.danger { background: var(--danger); color: #fff; }
`;

// ── Card Element ─────────────────────────────────────────────────────────────
class EmailInboxCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass     = null;
    this._config   = {};
    this._popup    = null;   // { email, loading, body_html, body_text, error }
    this._confirm  = null;   // { id, subject, fromPopup }
    this._busy     = new Set();
    this._lastErr  = "";
  }

  setConfig(cfg) {
    if (!cfg.entity)   throw new Error("email-inbox-card: 'entity' is required");
    if (!cfg.entry_id) throw new Error("email-inbox-card: 'entry_id' is required");
    this._config = {
      title:      cfg.title      ?? "Unread Emails",
      entity:     cfg.entity,
      entry_id:   cfg.entry_id,
      max_display:cfg.max_display ?? 20,
      tile_width: cfg.tile_width ?? 260,
      confirm_delete: cfg.confirm_delete !== false,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  // ── Data helpers ───────────────────────────────────────────────────────────
  _state()  { return this._hass?.states?.[this._config.entity]; }
  _emails() {
    const emails = this._state()?.attributes?.emails ?? [];
    return emails
      .filter(e => e.unread)
      .slice(0, this._config.max_display);
  }
  _unread() { return this._state()?.attributes?.unread_count ?? 0; }
  _account(){ return this._state()?.attributes?.account ?? ""; }
  _unavail(){ const s = this._state()?.state; return !s || s === "unavailable" || s === "unknown"; }

  // ── Actions ────────────────────────────────────────────────────────────────
  async _doService(service, messageId) {
    this._busy.add(messageId);
    this._lastErr = "";
    this._render();
    try {
      await this._hass.callService("email_inbox", service, {
        entry_id:   this._config.entry_id,
        message_id: messageId,
      });
    } catch (err) {
      console.error("email-inbox-card:", err);
      this._lastErr = String(err?.message ?? err);
    } finally {
      this._busy.delete(messageId);
      this._confirm = null;
      if (service === "delete_email" && this._popup?.email?.id === messageId) {
        this._popup = null;
      }
      this._render();
    }
  }

  _openPopup(email) {
    this._popup = { email, loading: true, body_html: "", body_text: "", error: "" };
    this._render();
    this._loadBody(email.id);
  }

  async _loadBody(messageId) {
    try {
      const token = this._hass.auth?.data?.access_token ?? "";
      const url = `/api/email_inbox/message_body?entry_id=${encodeURIComponent(this._config.entry_id)}&message_id=${encodeURIComponent(messageId)}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      if (this._popup && this._popup.email?.id === messageId) {
        this._popup = { ...this._popup, loading: false, ...data };
        this._render();
      }
    } catch (err) {
      if (this._popup && this._popup.email?.id === messageId) {
        this._popup = { ...this._popup, loading: false, error: String(err.message ?? err) };
        this._render();
      }
    }
  }

  _closePopup() { this._popup = null; this._render(); }

  _askDelete(id, subject, fromPopup = false) {
    if (this._config.confirm_delete) {
      this._confirm = { id, subject, fromPopup };
      this._render();
    } else {
      this._doService("delete_email", id);
    }
  }

  async _refresh() {
    try {
      await this._hass.callService("homeassistant", "update_entity", { entity_id: this._config.entity });
    } catch {}
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _render() {
    const emails  = this._emails();
    const unread  = this._unread();
    const account = this._account();
    const unavail = this._unavail();

    const stripContent = unavail
      ? `<div class="empty">${ICO.inbox}<span>Sensor unavailable — check integration setup</span></div>`
      : emails.length === 0
        ? `<div class="empty">${ICO.inbox}<span>No unread emails</span></div>`
        : emails.map(e => this._tileHtml(e)).join("");

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="hdr">
          <div class="hdr-left">
            <h2>${esc(this._config.title)}</h2>
            <span class="badge ${unread === 0 ? "zero" : ""}">${unread}</span>
            ${account ? `<span class="acct">${esc(account)}</span>` : ""}
          </div>
          <div class="hdr-right">
            <button class="icon-btn" id="btn-refresh" title="Refresh">${ICO.refresh}</button>
          </div>
        </div>
        ${this._lastErr ? `<div class="err-bar">⚠️ ${esc(this._lastErr)}</div>` : ""}
        <div class="strip-wrap" id="strip" style="--tile-w:${this._config.tile_width}px">
          ${stripContent}
        </div>
      </ha-card>
      ${this._popup    ? this._popupHtml()   : ""}
      ${this._confirm  ? this._confirmHtml() : ""}`;

    this._bindEvents();
  }

  _tileHtml(e) {
    const name  = senderName(e.from);
    const color = avatarColor(name);
    const busy  = this._busy.has(e.id);
    return `
      <div class="tile" data-id="${esc(e.id)}" data-open="1">
        <div class="tile-top">
          <div class="avatar" style="background:${color}">${esc(initials(name))}</div>
          <div class="tile-meta">
            <div class="tile-sender">${esc(name)}</div>
            <div class="tile-date">${fmtDate(e.date)}</div>
          </div>
        </div>
        <div class="tile-subject">${esc(e.subject || "(No Subject)")}</div>
        ${e.snippet ? `<div class="tile-snippet">${esc(e.snippet)}</div>` : ""}
        <div class="tile-actions">
          <button class="tile-btn btn-read" data-action="mark_read" data-id="${esc(e.id)}" ${busy ? "disabled" : ""}>
            ${ICO.read} Mark read
          </button>
          <button class="tile-btn btn-del" data-action="delete" data-id="${esc(e.id)}" data-subject="${esc(e.subject || "")}" ${busy ? "disabled" : ""}>
            ${ICO.trash} Delete
          </button>
        </div>
      </div>`;
  }

  _popupHtml() {
    const { email, loading, body_html, body_text, error } = this._popup;
    const name  = senderName(email.from);
    const color = avatarColor(name);
    const busy  = this._busy.has(email.id);

    let bodyContent;
    if (loading) {
      bodyContent = `<div class="popup-loading">${ICO.spinner}<span>Loading message…</span></div>`;
    } else if (error) {
      bodyContent = `<div class="popup-err">⚠️ Failed to load message body:<br><code>${esc(error)}</code></div>`;
    } else if (body_html) {
      // Render HTML in sandboxed iframe
      const encoded = encodeURIComponent(body_html);
      bodyContent = `<iframe sandbox="allow-same-origin" srcdoc="${esc(body_html)}" id="msg-iframe"></iframe>`;
    } else {
      bodyContent = `<div class="plain-body">${esc(body_text || email.snippet || "(No content)")}</div>`;
    }

    return `
      <div class="popup-overlay" id="popup-overlay">
        <div class="popup">
          <div class="popup-hdr">
            <div class="popup-avatar" style="background:${color}">${esc(initials(name))}</div>
            <div class="popup-hdr-info">
              <p class="popup-subject">${esc(email.subject || "(No Subject)")}</p>
              <div class="popup-from"><strong>${esc(name)}</strong> &lt;${esc(senderEmail(email.from))}&gt;</div>
              <div class="popup-date">${fmtDate(email.date)}</div>
            </div>
            <div class="popup-hdr-actions">
              ${email.unread ? `
                <button class="popup-action-btn btn-read" data-action="mark_read" data-id="${esc(email.id)}" ${busy ? "disabled" : ""}>
                  ${ICO.read} Mark read
                </button>` : ""}
              <button class="popup-action-btn btn-del" data-action="delete_popup" data-id="${esc(email.id)}" data-subject="${esc(email.subject || "")}" ${busy ? "disabled" : ""}>
                ${ICO.trash} Delete
              </button>
              <button class="popup-action-btn btn-close" id="popup-close">${ICO.close} Close</button>
            </div>
          </div>
          <div class="popup-body">${bodyContent}</div>
        </div>
      </div>`;
  }

  _confirmHtml() {
    const { subject } = this._confirm;
    return `
      <div class="confirm-overlay" id="confirm-overlay">
        <div class="confirm-box">
          <h3>Delete this email?</h3>
          <div class="confirm-preview">${esc(subject)}</div>
          <p>This will move the message to Trash / Deleted Items.</p>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" id="confirm-cancel">Cancel</button>
            <button class="confirm-btn danger" id="confirm-ok">Delete</button>
          </div>
        </div>
      </div>`;
  }

  // ── Event binding ──────────────────────────────────────────────────────────
  _bindEvents() {
    const s = this.shadowRoot;

    s.getElementById("btn-refresh")?.addEventListener("click", () => this._refresh());

    // Tile clicks — open popup OR action button
    s.querySelectorAll(".tile[data-open]").forEach(tile => {
      tile.addEventListener("click", e => {
        const actionBtn = e.target.closest("[data-action]");
        if (actionBtn) return; // handled separately
        const id = tile.dataset.id;
        const email = this._emails().find(em => em.id === id);
        if (email) this._openPopup(email);
      });
    });

    // Tile action buttons
    s.querySelectorAll(".tile-btn[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const { action, id, subject } = btn.dataset;
        if (action === "mark_read") this._doService("mark_read", id);
        if (action === "delete")    this._askDelete(id, subject, false);
      });
    });

    // Popup actions
    s.getElementById("popup-close")?.addEventListener("click", () => this._closePopup());
    s.getElementById("popup-overlay")?.addEventListener("click", e => {
      if (e.target.id === "popup-overlay") this._closePopup();
    });
    s.querySelectorAll(".popup-action-btn[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        const { action, id, subject } = btn.dataset;
        if (action === "mark_read")    this._doService("mark_read", id);
        if (action === "delete_popup") this._askDelete(id, subject, true);
      });
    });

    // Resize iframe after load
    const iframe = s.getElementById("msg-iframe");
    if (iframe) {
      iframe.addEventListener("load", () => {
        try {
          const h = iframe.contentDocument?.body?.scrollHeight;
          if (h) iframe.style.height = h + "px";
        } catch {}
      });
    }

    // Confirm dialog
    s.getElementById("confirm-cancel")?.addEventListener("click", () => {
      this._confirm = null; this._render();
    });
    s.getElementById("confirm-ok")?.addEventListener("click", () => {
      if (this._confirm) this._doService("delete_email", this._confirm.id);
    });

    // Close popup on Escape
    const onKey = e => { if (e.key === "Escape" && this._popup) { this._closePopup(); document.removeEventListener("keydown", onKey); } };
    if (this._popup) document.addEventListener("keydown", onKey);
  }

  getCardSize() { return 4; }

  static getStubConfig() {
    return {
      entity:     "sensor.gmail_inbox",
      entry_id:   "your_config_entry_id_here",
      title:      "Unread Emails",
      max_display: 20,
      confirm_delete: true,
    };
  }
}

customElements.define("email-inbox-card", EmailInboxCard);

window.customCards ??= [];
window.customCards.push({
  type: "email-inbox-card",
  name: "Email Inbox Card",
  description: "Horizontal strip of unread emails (Gmail & M365) with full popup reader, delete, and mark-read.",
  preview: false,
});

console.info(
  `%c EMAIL-INBOX-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#6366f1;padding:2px 5px;border-radius:4px 0 0 4px;font-weight:bold",
  "color:#6366f1;background:#f1f5f9;padding:2px 5px;border-radius:0 4px 4px 0"
);
