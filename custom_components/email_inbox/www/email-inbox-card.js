/**
 * email-inbox-card  v3.0.0
 *
 * Changes from v2:
 *  - Full-width: getGridOptions() + :host grid-column:1/-1
 *  - Popup rendered on document.body (outside all shadow DOMs) so
 *    position:fixed works correctly across the full viewport
 *  - Popup cleaned up on disconnectedCallback
 *  - Confirm dialog also on document.body
 */

const CARD_VERSION = "3.1.0";

// ── Helpers ───────────────────────────────────────────────────────────────────
const esc = s => String(s ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

function fmtDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d), now = new Date(), diff = now - dt;
    if (diff < 86400000 && dt.getDate() === now.getDate())
      return dt.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    if (diff < 7 * 86400000)
      return dt.toLocaleDateString([], { weekday:"short", hour:"2-digit", minute:"2-digit" });
    return dt.toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" });
  } catch { return String(d).slice(0,10); }
}

const senderName = from => {
  if (!from) return "Unknown";
  const m = from.match(/^"?([^"<]+?)"?\s*(?:<.*>)?$/);
  return (m ? m[1] : from.split("@")[0]).trim();
};
const senderAddr = from => (String(from??"").match(/<([^>]+)>/) ?? [])[1] ?? from;

function initials(n) {
  const p = n.split(/\s+/).filter(Boolean);
  return p.length >= 2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : n.slice(0,2).toUpperCase();
}
function avatarColor(n) {
  const C = ["#6366f1","#8b5cf6","#ec4899","#ef4444","#f97316",
             "#eab308","#22c55e","#14b8a6","#3b82f6","#06b6d4"];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h*31 + n.charCodeAt(i)) | 0;
  return C[Math.abs(h) % C.length];
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const I = {
  refresh:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
  trash:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  check:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  close:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  inbox:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>`,
  spin:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" dur="0.75s" repeatCount="indefinite" from="0 12 12" to="360 12 12"/></circle></svg>`,
};

// ── Card shadow-DOM styles (card only, no overlay) ─────────────────────────
const CARD_STYLES = `
  :host {
    display: block;
    /* Full-width inside HA's CSS grid */
    grid-column: 1 / -1;
    --bg:      var(--ha-card-background, var(--card-background-color, #fff));
    --txt1:    var(--primary-text-color, #1e293b);
    --txt2:    var(--secondary-text-color, #64748b);
    --div:     var(--divider-color, #e2e8f0);
    --acc:     var(--accent-color, #6366f1);
    --danger:  #ef4444;
  }
  ha-card { overflow: hidden; width: 100%; }

  /* Header */
  .hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px 12px;
    border-bottom: 1px solid var(--div);
  }
  .hdr-l { display: flex; align-items: center; gap: 10px; }
  .hdr h2 { margin: 0; font-size: .95rem; font-weight: 700; color: var(--txt1); }
  .badge {
    background: var(--acc); color: #fff;
    border-radius: 20px; padding: 2px 9px;
    font-size: .7rem; font-weight: 700;
  }
  .badge.z { background: var(--div); color: var(--txt2); }
  .acct { font-size: .72rem; color: var(--txt2); }
  .icon-btn {
    background: none; border: none; cursor: pointer; padding: 6px;
    border-radius: 8px; color: var(--txt2); display: flex; align-items: center;
    transition: background .15s, color .15s;
  }
  .icon-btn:hover { background: rgba(99,102,241,.1); color: var(--acc); }
  .icon-btn svg { width: 16px; height: 16px; }

  /* Error bar */
  .err { margin: 8px 20px; padding: 10px 14px; border-radius: 8px;
    background: rgba(239,68,68,.08); border-left: 3px solid var(--danger);
    font-size: .8rem; color: var(--danger); }

  /* Horizontal scroll strip */
  .strip {
    display: flex; align-items: stretch; gap: 14px;
    overflow-x: auto; overflow-y: hidden;
    padding: 16px 20px 18px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--div) transparent;
  }
  .strip::-webkit-scrollbar { height: 5px; }
  .strip::-webkit-scrollbar-thumb { background: var(--div); border-radius: 3px; }

  /* Tile */
  .tile {
    flex: 0 0 var(--tile-w, 260px);
    scroll-snap-align: start;
    border: 1px solid var(--div);
    border-left: 3px solid var(--acc);
    border-radius: 10px;
    padding: 14px;
    cursor: pointer;
    display: flex; flex-direction: column; gap: 8px;
    transition: transform .15s, box-shadow .15s;
    background: var(--bg);
    min-height: 136px;
    user-select: none;
  }
  .tile:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.1); }
  .tile-top { display: flex; align-items: center; gap: 10px; }
  .av {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: .75rem; font-weight: 700; color: #fff;
  }
  .meta { flex: 1; min-width: 0; }
  .sender { font-size: .82rem; font-weight: 700; color: var(--txt1);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tdate  { font-size: .68rem; color: var(--txt2); margin-top: 1px; }
  .subj   { font-size: .82rem; font-weight: 600; color: var(--txt1);
    overflow: hidden; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; }
  .snip   { font-size: .76rem; color: var(--txt2); flex: 1;
    overflow: hidden; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4; }
  .tile-acts {
    display: flex; gap: 6px; margin-top: auto;
    padding-top: 8px; border-top: 1px solid var(--div);
  }
  .tbtn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
    font-size: .72rem; font-weight: 600; padding: 5px 8px;
    border: none; border-radius: 6px; cursor: pointer;
    transition: background .15s;
  }
  .tbtn svg { width: 13px; height: 13px; flex-shrink: 0; }
  .tbtn.r { background: rgba(99,102,241,.1); color: var(--acc); }
  .tbtn.r:hover { background: rgba(99,102,241,.22); }
  .tbtn.d { background: rgba(239,68,68,.08); color: var(--danger); }
  .tbtn.d:hover { background: rgba(239,68,68,.18); }
  .tbtn:disabled { opacity: .4; pointer-events: none; }

  /* Empty state */
  .empty {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 32px; width: 100%; color: var(--txt2); font-size: .88rem;
  }
  .empty svg { width: 40px; height: 40px; opacity: .25; }
`;

// ── Popup styles — injected into document.body element (NOT shadow DOM) ──────
const POPUP_STYLES = `
  #eic-popup-root * { box-sizing: border-box; }
  #eic-popup-root {
    --bg:     #ffffff;
    --txt1:   #1e293b;
    --txt2:   #64748b;
    --div:    #e2e8f0;
    --acc:    #6366f1;
    --danger: #ef4444;
  }
  @media (prefers-color-scheme: dark) {
    #eic-popup-root {
      --bg:   #1e293b;
      --txt1: #f1f5f9;
      --txt2: #94a3b8;
      --div:  #334155;
    }
  }
  .eic-overlay {
    position: fixed; inset: 0; z-index: 999999;
    background: rgba(0,0,0,.6);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    animation: eicFadeIn .15s ease;
  }
  @keyframes eicFadeIn { from { opacity:0 } to { opacity:1 } }
  .eic-dialog {
    background: var(--bg);
    border-radius: 16px;
    width: 100%; max-width: 760px;
    max-height: 88vh;
    display: flex; flex-direction: column;
    box-shadow: 0 32px 80px rgba(0,0,0,.35);
    overflow: hidden;
    animation: eicSlide .18s ease;
  }
  @keyframes eicSlide { from { transform:translateY(18px);opacity:0 } to { transform:none;opacity:1 } }

  /* Dialog header */
  .eic-dhdr {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--div);
    flex-shrink: 0;
  }
  .eic-av {
    width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: .92rem; font-weight: 700; color: #fff;
  }
  .eic-hinfo { flex: 1; min-width: 0; }
  .eic-subj {
    font-size: 1.05rem; font-weight: 700; color: var(--txt1);
    margin: 0 0 5px; line-height: 1.3; word-break: break-word;
  }
  .eic-from { font-size: .82rem; color: var(--txt2); }
  .eic-from strong { color: var(--txt1); font-weight: 600; }
  .eic-date { font-size: .76rem; color: var(--txt2); margin-top: 3px; }

  .eic-hbtns {
    display: flex; gap: 7px; flex-shrink: 0;
    flex-wrap: wrap; align-items: flex-start; justify-content: flex-end;
  }
  .eic-btn {
    display: flex; align-items: center; gap: 5px;
    font-size: .8rem; font-weight: 600;
    padding: 8px 14px; border: none; border-radius: 8px;
    cursor: pointer; transition: background .15s; white-space: nowrap;
  }
  .eic-btn svg { width: 14px; height: 14px; flex-shrink: 0; }
  .eic-btn.r  { background: rgba(99,102,241,.12); color: var(--acc); }
  .eic-btn.r:hover  { background: rgba(99,102,241,.24); }
  .eic-btn.d  { background: rgba(239,68,68,.1); color: var(--danger); }
  .eic-btn.d:hover  { background: rgba(239,68,68,.22); }
  .eic-btn.cl { background: var(--div); color: var(--txt1); }
  .eic-btn.cl:hover { background: #cbd5e1; }
  .eic-btn:disabled { opacity: .4; pointer-events: none; }

  /* Dialog body */
  .eic-dbody {
    flex: 1; overflow-y: auto; padding: 20px;
    font-size: .9rem; line-height: 1.7; color: var(--txt1);
  }
  .eic-loading {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 14px; padding: 56px;
    color: var(--txt2); font-size: .9rem;
  }
  .eic-loading svg { width: 30px; height: 30px; color: var(--acc); }
  .eic-err { color: var(--danger); padding: 28px; text-align: center; font-size: .88rem; }
  .eic-err code { display:block; margin-top:8px; font-size:.78rem; opacity:.8; }
  .eic-plain {
    white-space: pre-wrap; word-break: break-word;
    font-family: inherit; font-size: .88rem;
    color: var(--txt1); line-height: 1.7;
  }
  .eic-iframe {
    width: 100%; border: none; min-height: 300px;
    border-radius: 8px; background: #fff; display: block;
  }

  /* Confirm overlay — stacks above popup */
  .eic-confirm-overlay {
    position: fixed; inset: 0; z-index: 1000000;
    background: rgba(0,0,0,.65);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .eic-confirm-box {
    background: var(--bg); border-radius: 14px; padding: 30px 24px;
    max-width: 360px; width: 100%; text-align: center;
    box-shadow: 0 20px 56px rgba(0,0,0,.3);
  }
  .eic-confirm-box h3 { margin: 0 0 8px; font-size: 1rem; color: var(--txt1); }
  .eic-confirm-box p  { margin: 0 0 16px; font-size: .84rem; color: var(--txt2); }
  .eic-subj-preview {
    font-size: .82rem; font-weight: 600; color: var(--txt1);
    background: var(--div); border-radius: 6px; padding: 8px 12px;
    margin-bottom: 20px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }
  .eic-confirm-row { display: flex; gap: 10px; }
  .eic-confirm-btn {
    flex: 1; padding: 11px; border: none; border-radius: 8px;
    cursor: pointer; font-size: .88rem; font-weight: 600;
    transition: opacity .15s;
  }
  .eic-confirm-btn:hover { opacity: .85; }
  .eic-confirm-btn.cancel { background: var(--div); color: var(--txt1); }
  .eic-confirm-btn.del    { background: var(--danger); color: #fff; }
`;

// ── Custom Element ────────────────────────────────────────────────────────────
class EmailInboxCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass   = null;
    this._config = {};
    this._popup  = null;   // { email, loading, body_html, body_text, error }
    this._confirm= null;   // { id, subject }
    this._busy   = new Set();
    this._lastErr= "";

    // Root element appended to document.body for overlays
    this._bodyRoot = null;
    this._keyHandler = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  connectedCallback() {
    // Inject global popup styles once
    if (!document.getElementById("eic-global-styles")) {
      const s = document.createElement("style");
      s.id = "eic-global-styles";
      s.textContent = POPUP_STYLES;
      document.head.appendChild(s);
    }
    // Create the body-level root for overlays
    if (!this._bodyRoot) {
      this._bodyRoot = document.createElement("div");
      this._bodyRoot.id = "eic-popup-root";
      document.body.appendChild(this._bodyRoot);
    }
  }

  disconnectedCallback() {
    this._removeBodyRoot();
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
  }

  _removeBodyRoot() {
    if (this._bodyRoot) {
      this._bodyRoot.remove();
      this._bodyRoot = null;
    }
  }

  // ── Config ──────────────────────────────────────────────────────────────────
  setConfig(cfg) {
    if (!cfg.entity)   throw new Error("email-inbox-card: 'entity' is required");
    if (!cfg.entry_id) throw new Error("email-inbox-card: 'entry_id' is required");
    this._config = {
      title:          cfg.title          ?? "Unread Emails",
      entity:         cfg.entity,
      entry_id:       cfg.entry_id,
      max_display:    cfg.max_display    ?? 20,
      tile_width:     cfg.tile_width     ?? 260,
      confirm_delete: cfg.confirm_delete !== false,
    };
    this._renderCard();
  }

  set hass(hass) {
    this._hass = hass;
    this._renderCard();
  }

  // ── Data helpers ─────────────────────────────────────────────────────────────
  _st()     { return this._hass?.states?.[this._config.entity]; }
  _emails() {
    return (this._st()?.attributes?.emails ?? [])
      .filter(e => e.unread)
      .slice(0, this._config.max_display);
  }
  _unread() { return this._st()?.attributes?.unread_count ?? 0; }
  _account(){ return this._st()?.attributes?.account ?? ""; }
  _unavail(){ const s = this._st()?.state; return !s || s==="unavailable" || s==="unknown"; }

  // ── HA grid — tell HA this card wants full width ──────────────────────────
  getGridOptions() {
    return { columns: 12, rows: 3, min_columns: 4, min_rows: 2 };
  }
  getCardSize() { return 3; }

  // ── Service calls ────────────────────────────────────────────────────────────
  async _doService(service, messageId) {
    this._busy.add(messageId);
    this._lastErr = "";
    this._renderCard();
    this._renderOverlay();
    try {
      await this._hass.callService("email_inbox", service, {
        entry_id:   this._config.entry_id,
        message_id: messageId,
      });
    } catch (err) {
      this._lastErr = String(err?.message ?? err);
      console.error("email-inbox-card:", err);
    } finally {
      this._busy.delete(messageId);
      this._confirm = null;
      if (service === "delete_email" && this._popup?.email?.id === messageId) {
        this._popup = null;
      }
      this._renderCard();
      this._renderOverlay();
    }
  }

  async _refresh() {
    try {
      await this._hass.callService("homeassistant", "update_entity",
        { entity_id: this._config.entity });
    } catch {}
  }

  // ── Popup ─────────────────────────────────────────────────────────────────
  _openPopup(email) {
    this._popup = { email, loading: true, body_html: "", body_text: "", error: "" };
    this._renderOverlay();
    this._loadBody(email.id);
    // Keyboard close
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
    this._keyHandler = e => { if (e.key === "Escape") this._closePopup(); };
    document.addEventListener("keydown", this._keyHandler);
  }

  _closePopup() {
    this._popup = null;
    this._confirm = null;
    this._renderOverlay();
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
  }

  async _loadBody(messageId) {
    try {
      const token = this._hass.auth?.data?.access_token ?? "";
      const url = `/api/email_inbox/message_body?` +
        `entry_id=${encodeURIComponent(this._config.entry_id)}` +
        `&message_id=${encodeURIComponent(messageId)}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      if (this._popup?.email?.id === messageId) {
        this._popup = { ...this._popup, loading: false, ...data };
        this._renderOverlay();
      }
    } catch (err) {
      if (this._popup?.email?.id === messageId) {
        this._popup = { ...this._popup, loading: false, error: String(err.message ?? err) };
        this._renderOverlay();
      }
    }
  }

  _askDelete(id, subject) {
    if (this._config.confirm_delete) {
      this._confirm = { id, subject };
      this._renderOverlay();
    } else {
      this._doService("delete_email", id);
    }
  }

  // ── Render: card (shadow DOM) ──────────────────────────────────────────────
  _renderCard() {
    const emails  = this._emails();
    const unread  = this._unread();
    const account = this._account();
    const unavail = this._unavail();
    const tw      = this._config.tile_width;

    let strip;
    if (unavail) {
      strip = `<div class="empty">${I.inbox}<span>Sensor unavailable — check integration</span></div>`;
    } else if (!emails.length) {
      strip = `<div class="empty">${I.inbox}<span>No unread emails ✓</span></div>`;
    } else {
      strip = emails.map(e => {
        const nm  = senderName(e.from);
        const col = avatarColor(nm);
        const bz  = this._busy.has(e.id);
        return `
          <div class="tile" data-id="${esc(e.id)}" data-open="1" style="--tile-w:${tw}px">
            <div class="tile-top">
              <div class="av" style="background:${col}">${esc(initials(nm))}</div>
              <div class="meta">
                <div class="sender">${esc(nm)}</div>
                <div class="tdate">${fmtDate(e.date)}</div>
              </div>
            </div>
            <div class="subj">${esc(e.subject || "(No Subject)")}</div>
            ${e.snippet ? `<div class="snip">${esc(e.snippet)}</div>` : ""}
            <div class="tile-acts">
              <button class="tbtn r" data-action="mark_read" data-id="${esc(e.id)}" ${bz?"disabled":""}>
                ${I.check} Mark read
              </button>
              <button class="tbtn d" data-action="delete" data-id="${esc(e.id)}" data-subject="${esc(e.subject||"")}" ${bz?"disabled":""}>
                ${I.trash} Delete
              </button>
            </div>
          </div>`;
      }).join("");
    }

    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLES}</style>
      <ha-card>
        <div class="hdr">
          <div class="hdr-l">
            <h2>${esc(this._config.title)}</h2>
            <span class="badge ${unread===0?"z":""}">${unread}</span>
            ${account ? `<span class="acct">${esc(account)}</span>` : ""}
          </div>
          <button class="icon-btn" id="btn-ref" title="Refresh">${I.refresh}</button>
        </div>
        ${this._lastErr ? `<div class="err">⚠️ ${esc(this._lastErr)}</div>` : ""}
        <div class="strip">${strip}</div>
      </ha-card>`;

    // Bind card events
    this.shadowRoot.getElementById("btn-ref")
      ?.addEventListener("click", () => this._refresh());

    this.shadowRoot.querySelectorAll(".tile[data-open]").forEach(tile => {
      tile.addEventListener("click", e => {
        if (e.target.closest("[data-action]")) return;
        const email = this._emails().find(em => em.id === tile.dataset.id);
        if (email) this._openPopup(email);
      });
    });

    this.shadowRoot.querySelectorAll(".tbtn[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const { action, id, subject } = btn.dataset;
        if (action === "mark_read") this._doService("mark_read", id);
        if (action === "delete")    this._askDelete(id, subject);
      });
    });
  }

  // ── Render: overlay (document.body) ──────────────────────────────────────
  _renderOverlay() {
    if (!this._bodyRoot) {
      // Recreate if disconnected/GC'd
      this._bodyRoot = document.createElement("div");
      this._bodyRoot.id = "eic-popup-root";
      document.body.appendChild(this._bodyRoot);
    }

    if (!this._popup && !this._confirm) {
      this._bodyRoot.innerHTML = "";
      return;
    }

    let html = "";

    if (this._popup) {
      const { email, loading, body_html, body_text, error } = this._popup;
      const nm  = senderName(email.from);
      const col = avatarColor(nm);
      const bz  = this._busy.has(email.id);

      let body;
      if (loading) {
        body = `<div class="eic-loading">${I.spin}<span>Loading message…</span></div>`;
      } else if (error) {
        body = `<div class="eic-err">⚠️ Could not load message body<code>${esc(error)}</code></div>`;
      } else if (body_html) {
        // srcdoc sandboxed iframe for HTML emails
        body = `<iframe class="eic-iframe" id="eic-iframe" sandbox="allow-same-origin"
          srcdoc="${esc(body_html)}"></iframe>`;
      } else {
        body = `<div class="eic-plain">${esc(body_text || email.snippet || "(No content)")}</div>`;
      }

      html += `
        <div class="eic-overlay" id="eic-overlay">
          <div class="eic-dialog">
            <div class="eic-dhdr">
              <div class="eic-av" style="background:${col}">${esc(initials(nm))}</div>
              <div class="eic-hinfo">
                <p class="eic-subj">${esc(email.subject || "(No Subject)")}</p>
                <div class="eic-from"><strong>${esc(nm)}</strong> &lt;${esc(senderAddr(email.from))}&gt;</div>
                <div class="eic-date">${fmtDate(email.date)}</div>
              </div>
              <div class="eic-hbtns">
                ${email.unread ? `<button class="eic-btn r" id="eic-markread" data-id="${esc(email.id)}" ${bz?"disabled":""}>${I.check} Mark read</button>` : ""}
                <button class="eic-btn d" id="eic-del" data-id="${esc(email.id)}" data-subject="${esc(email.subject||"")}" ${bz?"disabled":""}>${I.trash} Delete</button>
                <button class="eic-btn cl" id="eic-close">${I.close} Close</button>
              </div>
            </div>
            <div class="eic-dbody">${body}</div>
          </div>
        </div>`;
    }

    if (this._confirm) {
      const { id, subject } = this._confirm;
      html += `
        <div class="eic-confirm-overlay" id="eic-conf-overlay">
          <div class="eic-confirm-box">
            <h3>Delete this email?</h3>
            <div class="eic-subj-preview">${esc(subject)}</div>
            <p>The message will be moved to Trash&nbsp;/&nbsp;Deleted&nbsp;Items.</p>
            <div class="eic-confirm-row">
              <button class="eic-confirm-btn cancel" id="eic-conf-cancel">Cancel</button>
              <button class="eic-confirm-btn del" id="eic-conf-ok" data-id="${esc(id)}">Delete</button>
            </div>
          </div>
        </div>`;
    }

    this._bodyRoot.innerHTML = html;
    this._bindOverlayEvents();
  }

  _bindOverlayEvents() {
    // NOTE: this._bodyRoot is a plain <div> appended to document.body.
    // Plain divs do NOT have getElementById — use querySelector("#id") instead.
    const $ = sel => this._bodyRoot.querySelector(sel);

    // Close popup when clicking the dark backdrop (not the dialog itself)
    $("#eic-overlay")?.addEventListener("click", e => {
      if (e.target.id === "eic-overlay") this._closePopup();
    });

    // Close button inside the popup header
    $("#eic-close")?.addEventListener("click", () => this._closePopup());

    // Mark as read button inside the popup header
    $("#eic-markread")?.addEventListener("click", e => {
      this._doService("mark_read", e.currentTarget.dataset.id);
    });

    // Delete button inside the popup header
    $("[id='eic-del']")?.addEventListener("click", e => {
      this._askDelete(e.currentTarget.dataset.id, e.currentTarget.dataset.subject);
    });

    // Confirm dialog — cancel
    $("#eic-conf-cancel")?.addEventListener("click", () => {
      this._confirm = null;
      this._renderOverlay();
    });

    // Confirm dialog — confirm delete
    $("#eic-conf-ok")?.addEventListener("click", e => {
      this._doService("delete_email", e.currentTarget.dataset.id);
    });

    // Auto-size HTML email iframe to its content
    const iframe = $("[id='eic-iframe']");
    if (iframe) {
      iframe.addEventListener("load", () => {
        try {
          const h = iframe.contentDocument?.documentElement?.scrollHeight
                 || iframe.contentDocument?.body?.scrollHeight;
          if (h) iframe.style.height = Math.min(h, 600) + "px";
        } catch {}
      });
    }
  }

  static getStubConfig() {
    return {
      entity:         "sensor.gmail_inbox",
      entry_id:       "your_config_entry_id_here",
      title:          "Unread Emails",
      max_display:    20,
      tile_width:     260,
      confirm_delete: true,
    };
  }
}

customElements.define("email-inbox-card", EmailInboxCard);

window.customCards ??= [];
window.customCards.push({
  type:        "email-inbox-card",
  name:        "Email Inbox Card",
  description: "Full-width horizontal strip of unread emails with popup reader, delete, and mark-read.",
  preview:     false,
});

console.info(
  `%c EMAIL-INBOX-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#6366f1;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:bold",
  "color:#6366f1;background:#f1f5f9;padding:2px 6px;border-radius:0 4px 4px 0"
);
