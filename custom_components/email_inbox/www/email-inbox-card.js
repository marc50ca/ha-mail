/**
 * email-inbox-card  v4.0.0
 *
 * Mobile-first rewrite:
 * - ONLY uses click events (no touchend duplication).
 *   touch-action:manipulation already removes the 300ms delay.
 * - Popup appended to document.body (escapes shadow-DOM stacking context).
 * - Backdrop uses a dedicated transparent div behind the dialog — clicking it
 *   always closes; no e.target comparison needed.
 * - e.currentTarget never accessed outside a live dispatch (fixes null bug).
 * - All interactive elements: min 44×44px, touch-action:manipulation,
 *   -webkit-tap-highlight-color:transparent, pointer-events:none on SVG children.
 */

const CARD_VERSION = "4.0.0";

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
const senderAddr = from => (String(from ?? "").match(/<([^>]+)>/) ?? [])[1] ?? from;

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

// ── SVG Icons ─────────────────────────────────────────────────────────────────
// All SVGs have pointer-events:none so e.target is always the parent button.
const SVG = attr => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  style="pointer-events:none;flex-shrink:0" ${attr}`;
const I = {
  refresh: SVG('width="17" height="17">') + `<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
  trash:   SVG('width="15" height="15">') + `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  check:   SVG('width="15" height="15">') + `<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  close:   SVG('width="16" height="16">') + `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  inbox:   SVG('width="40" height="40" style="opacity:.25;pointer-events:none">') + `<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>`,
  spin:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="28" height="28" style="pointer-events:none"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" dur="0.75s" repeatCount="indefinite" from="0 12 12" to="360 12 12"/></circle></svg>`,
};

// ── Reusable mobile-safe button style ─────────────────────────────────────────
// Applied to every interactive element; eliminates 300ms tap delay via
// touch-action:manipulation; clears the iOS tap flash.
const BTN_BASE = [
  "cursor:pointer",
  "touch-action:manipulation",
  "-webkit-tap-highlight-color:transparent",
  "user-select:none",
  "border:none",
  "-webkit-appearance:none",
].join(";");

// ── Card shadow-DOM styles ────────────────────────────────────────────────────
const CARD_STYLES = `
  :host {
    display: block;
    grid-column: 1 / -1;
    --bg:     var(--ha-card-background, var(--card-background-color, #fff));
    --txt1:   var(--primary-text-color, #1e293b);
    --txt2:   var(--secondary-text-color, #64748b);
    --div:    var(--divider-color, #e2e8f0);
    --acc:    var(--accent-color, #6366f1);
    --danger: #ef4444;
  }
  ha-card { overflow: hidden; width: 100%; }

  .hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px 12px; border-bottom: 1px solid var(--div);
  }
  .hdr-l { display: flex; align-items: center; gap: 10px; }
  .hdr h2 { margin:0; font-size:.95rem; font-weight:700; color:var(--txt1); }
  .badge {
    background: var(--acc); color:#fff; border-radius:20px;
    padding:2px 9px; font-size:.7rem; font-weight:700;
  }
  .badge.z { background:var(--div); color:var(--txt2); }
  .acct { font-size:.72rem; color:var(--txt2); }
  .icon-btn {
    background:none; padding:10px; border-radius:8px;
    color:var(--txt2); display:flex; align-items:center;
    transition:background .15s, color .15s;
    min-height:44px; min-width:44px;
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
    border:none; -webkit-appearance:none;
  }
  .icon-btn:hover { background:rgba(99,102,241,.1); color:var(--acc); }

  .err {
    margin:8px 20px; padding:10px 14px; border-radius:8px;
    background:rgba(239,68,68,.08); border-left:3px solid var(--danger);
    font-size:.8rem; color:var(--danger);
  }

  .strip {
    display:flex; align-items:stretch; gap:14px;
    overflow-x:auto; overflow-y:hidden;
    padding:16px 20px 18px;
    scroll-snap-type:x mandatory;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:thin; scrollbar-color:var(--div) transparent;
  }
  .strip::-webkit-scrollbar { height:5px; }
  .strip::-webkit-scrollbar-thumb { background:var(--div); border-radius:3px; }

  .tile {
    flex:0 0 var(--tile-w,260px); scroll-snap-align:start;
    border:1px solid var(--div); border-left:3px solid var(--acc);
    border-radius:10px; padding:14px;
    display:flex; flex-direction:column; gap:8px;
    transition:box-shadow .15s, border-color .15s;
    background:var(--bg); min-height:136px;
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent; user-select:none;
  }
  .tile:hover { box-shadow:0 6px 20px rgba(0,0,0,.1); border-color:var(--acc); }
  .tile:active { box-shadow:0 2px 8px rgba(0,0,0,.12); }

  .tile-top { display:flex; align-items:center; gap:10px; }
  .av {
    width:36px; height:36px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:.75rem; font-weight:700; color:#fff; pointer-events:none;
  }
  .meta { flex:1; min-width:0; pointer-events:none; }
  .sender { font-size:.82rem; font-weight:700; color:var(--txt1);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tdate { font-size:.68rem; color:var(--txt2); margin-top:1px; }
  .subj {
    font-size:.82rem; font-weight:600; color:var(--txt1); pointer-events:none;
    overflow:hidden; display:-webkit-box;
    -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.35;
  }
  .snip {
    font-size:.76rem; color:var(--txt2); flex:1; pointer-events:none;
    overflow:hidden; display:-webkit-box;
    -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.4;
  }
  .tile-acts {
    display:flex; gap:6px; margin-top:auto;
    padding-top:8px; border-top:1px solid var(--div);
  }
  .tbtn {
    flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
    font-size:.72rem; font-weight:600; padding:5px 8px;
    border-radius:6px; transition:background .15s;
    min-height:44px;
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
    border:none; -webkit-appearance:none;
  }
  .tbtn.r { background:rgba(99,102,241,.1); color:var(--acc); }
  .tbtn.r:hover { background:rgba(99,102,241,.22); }
  .tbtn.d { background:rgba(239,68,68,.08); color:var(--danger); }
  .tbtn.d:hover { background:rgba(239,68,68,.18); }
  .tbtn:disabled { opacity:.4; pointer-events:none; }

  .empty {
    display:flex; flex-direction:column; align-items:center; gap:10px;
    padding:32px; width:100%; color:var(--txt2); font-size:.88rem;
  }
`;

// ── Popup / overlay styles — lives on document.body, NOT in shadow DOM ────────
const POPUP_CSS = `
  #eic-root { font-family: var(--paper-font-body1_-_font-family, sans-serif); }
  #eic-root *, #eic-root *::before, #eic-root *::after { box-sizing:border-box; }
  #eic-root {
    --bg:     #ffffff;
    --txt1:   #1e293b;
    --txt2:   #64748b;
    --div:    #e2e8f0;
    --acc:    #6366f1;
    --danger: #ef4444;
  }
  @media (prefers-color-scheme: dark) {
    #eic-root { --bg:#1e293b; --txt1:#f1f5f9; --txt2:#94a3b8; --div:#334155; }
  }

  /* ── Backdrop ── */
  .eic-backdrop {
    position:fixed; inset:0; z-index:999998;
    background:rgba(0,0,0,.65);
    /* No backdrop-filter — causes compositing layer that swallows
       touch events on iOS Safari / Android Chrome */
    animation:eicFade .15s ease;
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
  }
  @keyframes eicFade { from{opacity:0} to{opacity:1} }

  /* ── Dialog ── */
  .eic-dialog {
    position:fixed; z-index:999999;
    top:50%; left:50%; transform:translate(-50%,-50%);
    width:calc(100% - 32px); max-width:760px;
    max-height:88vh;
    background:var(--bg);
    border-radius:16px;
    display:flex; flex-direction:column;
    box-shadow:0 32px 80px rgba(0,0,0,.35);
    overflow:hidden;
    animation:eicSlide .18s ease;
    /* Prevent dialog from accidentally closing via backdrop touch-through */
    touch-action:pan-y;
  }
  @keyframes eicSlide { from{transform:translate(-50%,-46%);opacity:0} to{transform:translate(-50%,-50%);opacity:1} }

  /* ── Close ×  button (top-right corner of dialog) ── */
  .eic-x {
    position:absolute; top:10px; right:10px; z-index:2;
    width:40px; height:40px; border-radius:50%;
    background:var(--div); color:var(--txt1);
    display:flex; align-items:center; justify-content:center;
    transition:background .15s;
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
    border:none; -webkit-appearance:none;
  }
  .eic-x:hover  { background:#cbd5e1; }
  .eic-x:active { transform:scale(.9); }

  /* ── Header ── */
  .eic-hdr {
    display:flex; align-items:flex-start; gap:14px;
    padding:20px 60px 16px 20px;
    border-bottom:1px solid var(--div); flex-shrink:0;
  }
  .eic-av {
    width:46px; height:46px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:.92rem; font-weight:700; color:#fff; pointer-events:none;
  }
  .eic-hi { flex:1; min-width:0; }
  .eic-subj {
    font-size:1.05rem; font-weight:700; color:var(--txt1);
    margin:0 0 4px; line-height:1.3; word-break:break-word;
  }
  .eic-from { font-size:.82rem; color:var(--txt2); }
  .eic-from strong { color:var(--txt1); font-weight:600; }
  .eic-date { font-size:.75rem; color:var(--txt2); margin-top:3px; }

  .eic-btns {
    display:flex; gap:8px; flex-wrap:wrap;
    padding:12px 20px; border-bottom:1px solid var(--div);
    flex-shrink:0;
  }
  .eic-btn {
    display:flex; align-items:center; gap:6px;
    font-size:.82rem; font-weight:600;
    padding:10px 16px; border-radius:8px;
    min-height:44px;
    transition:background .15s; white-space:nowrap;
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
    border:none; -webkit-appearance:none;
  }
  .eic-btn.r { background:rgba(99,102,241,.12); color:var(--acc); }
  .eic-btn.r:hover { background:rgba(99,102,241,.24); }
  .eic-btn.d { background:rgba(239,68,68,.1);  color:var(--danger); }
  .eic-btn.d:hover { background:rgba(239,68,68,.22); }
  .eic-btn:disabled { opacity:.4; pointer-events:none; }

  /* ── Body ── */
  .eic-body {
    flex:1; overflow-y:auto; padding:20px;
    font-size:.9rem; line-height:1.7; color:var(--txt1);
    -webkit-overflow-scrolling:touch;
  }
  .eic-loading {
    display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:14px; padding:56px;
    color:var(--txt2); font-size:.9rem;
  }
  .eic-err { color:var(--danger); padding:28px; text-align:center; font-size:.88rem; }
  .eic-err code { display:block; margin-top:8px; font-size:.78rem; opacity:.8; }
  .eic-plain {
    white-space:pre-wrap; word-break:break-word;
    font-family:inherit; font-size:.88rem; color:var(--txt1); line-height:1.7;
  }
  .eic-iframe {
    width:100%; border:none; min-height:300px;
    border-radius:8px; background:#fff; display:block;
  }

  /* ── Confirm dialog (stacks above popup) ── */
  .eic-conf-backdrop {
    position:fixed; inset:0; z-index:1000000;
    background:rgba(0,0,0,.7);
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
  }
  .eic-conf-box {
    position:fixed; z-index:1000001;
    top:50%; left:50%; transform:translate(-50%,-50%);
    width:calc(100% - 48px); max-width:360px;
    background:var(--bg); border-radius:14px;
    padding:28px 24px; text-align:center;
    box-shadow:0 20px 56px rgba(0,0,0,.3);
    touch-action:pan-y;
  }
  .eic-conf-box h3 { margin:0 0 8px; font-size:1rem; color:var(--txt1); }
  .eic-conf-box p  { margin:0 0 16px; font-size:.84rem; color:var(--txt2); }
  .eic-conf-prev {
    font-size:.82rem; font-weight:600; color:var(--txt1);
    background:var(--div); border-radius:6px; padding:8px 12px;
    margin-bottom:20px; overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap;
  }
  .eic-conf-row { display:flex; gap:10px; }
  .eic-conf-btn {
    flex:1; padding:14px; border-radius:8px;
    font-size:.88rem; font-weight:600; min-height:48px;
    transition:opacity .15s;
    cursor:pointer; touch-action:manipulation;
    -webkit-tap-highlight-color:transparent;
    border:none; -webkit-appearance:none;
  }
  .eic-conf-btn:hover { opacity:.85; }
  .eic-conf-btn.cancel { background:var(--div); color:var(--txt1); }
  .eic-conf-btn.del    { background:var(--danger); color:#fff; }
`;

// ── Custom Element ────────────────────────────────────────────────────────────
class EmailInboxCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode:"open" });
    this._hass   = null;
    this._config = {};
    this._popup  = null;
    this._confirm= null;
    this._busy   = new Set();
    this._lastErr= "";
    this._root   = null;   // div on document.body
    this._pendingIframeHtml = null;
    this._keyHandler = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  connectedCallback() {
    // Inject global styles once
    if (!document.getElementById("eic-global-css")) {
      const s = document.createElement("style");
      s.id = "eic-global-css";
      s.textContent = POPUP_CSS;
      document.head.appendChild(s);
    }
    if (!this._root) {
      this._root = document.createElement("div");
      this._root.id = "eic-root";
      document.body.appendChild(this._root);
    }
  }

  disconnectedCallback() {
    this._root?.remove();
    this._root = null;
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
  }

  // ── Config ───────────────────────────────────────────────────────────────────
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

  set hass(hass) { this._hass = hass; this._renderCard(); }

  // ── Data ─────────────────────────────────────────────────────────────────────
  _st()     { return this._hass?.states?.[this._config.entity]; }
  _emails() {
    return (this._st()?.attributes?.emails ?? [])
      .filter(e => e.unread).slice(0, this._config.max_display);
  }
  _unread() { return this._st()?.attributes?.unread_count ?? 0; }
  _account(){ return this._st()?.attributes?.account ?? ""; }
  _unavail(){ const s = this._st()?.state; return !s||s==="unavailable"||s==="unknown"; }

  getGridOptions() { return { columns:12, rows:3, min_columns:4, min_rows:2 }; }
  getCardSize()    { return 3; }

  // ── Services ─────────────────────────────────────────────────────────────────
  async _doService(service, msgId) {
    if (!msgId || msgId === "undefined") {
      this._lastErr = "Missing message ID — refresh the card and try again";
      this._renderCard();
      return;
    }
    this._busy.add(msgId);
    this._lastErr = "";
    this._renderCard();
    this._renderOverlay();
    try {
      await this._hass.callService("email_inbox", service,
        { entry_id: this._config.entry_id, message_id: msgId });
    } catch (err) {
      this._lastErr = String(err?.message ?? err);
      console.error("email-inbox-card:", err);
    } finally {
      this._busy.delete(msgId);
      this._confirm = null;
      if (service === "delete_email" && this._popup?.email?.id === msgId)
        this._popup = null;
      this._renderCard();
      this._renderOverlay();
    }
  }

  async _refresh() {
    try {
      await this._hass.callService("homeassistant","update_entity",
        { entity_id: this._config.entity });
    } catch {}
  }

  // ── Popup lifecycle ──────────────────────────────────────────────────────────
  _openPopup(email) {
    this._popup = { email, loading:true, body_html:"", body_text:"", error:"" };
    this._renderOverlay();
    this._loadBody(email.id);
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
    this._keyHandler = e => { if (e.key === "Escape") this._closePopup(); };
    document.addEventListener("keydown", this._keyHandler);
  }

  _closePopup() {
    this._popup  = null;
    this._confirm = null;
    this._renderOverlay();
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
  }

  async _loadBody(msgId) {
    try {
      const token = this._hass.auth?.data?.access_token ?? "";
      const url = `/api/email_inbox/message_body?` +
        `entry_id=${encodeURIComponent(this._config.entry_id)}` +
        `&message_id=${encodeURIComponent(msgId)}`;
      const resp = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      if (this._popup?.email?.id === msgId) {
        this._popup = { ...this._popup, loading:false, ...data };
        this._renderOverlay();
      }
    } catch (err) {
      if (this._popup?.email?.id === msgId) {
        this._popup = { ...this._popup, loading:false, error:String(err.message ?? err) };
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

  // ── Render: card (shadow DOM) ─────────────────────────────────────────────
  _renderCard() {
    const emails  = this._emails();
    const unread  = this._unread();
    const account = this._account();
    const unavail = this._unavail();
    const tw      = this._config.tile_width;

    let strip;
    if (unavail) {
      strip = `<div class="empty">${I.inbox}<span>Sensor unavailable</span></div>`;
    } else if (!emails.length) {
      strip = `<div class="empty">${I.inbox}<span>No unread emails ✓</span></div>`;
    } else {
      strip = emails.map(e => {
        const nm  = senderName(e.from);
        const col = avatarColor(nm);
        const bz  = this._busy.has(e.id);
        return `
          <div class="tile" data-tile-id="${esc(e.id)}" style="--tile-w:${tw}px">
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
              <button class="tbtn r" data-act="mark_read" data-id="${esc(e.id)}" ${bz?"disabled":""}>
                ${I.check} Mark read
              </button>
              <button class="tbtn d" data-act="delete" data-id="${esc(e.id)}" data-subject="${esc(e.subject||"")}" ${bz?"disabled":""}>
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

    // ── Card event listeners ──────────────────────────────────────────────────
    // Use only 'click'. touch-action:manipulation on every element removes the
    // 300ms delay, so click fires immediately on mobile. No touchend needed.

    this.shadowRoot.getElementById("btn-ref")
      ?.addEventListener("click", () => this._refresh());

    this.shadowRoot.querySelectorAll(".tile[data-tile-id]").forEach(tile => {
      tile.addEventListener("click", e => {
        // If the click target (or any ancestor up to the tile) has data-act,
        // it's an action button — let that handler deal with it.
        if (e.target.closest("[data-act]")) return;
        const email = this._emails().find(em => em.id === tile.dataset.tileId);
        if (email) this._openPopup(email);
      });
    });

    this.shadowRoot.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const { act, id, subject } = btn.dataset;
        if (act === "mark_read") this._doService("mark_read", id);
        if (act === "delete")    this._askDelete(id, subject);
      });
    });
  }

  // ── Render: overlay (document.body) ─────────────────────────────────────────
  _renderOverlay() {
    if (!this._root) {
      this._root = document.createElement("div");
      this._root.id = "eic-root";
      document.body.appendChild(this._root);
    }

    // Clear everything first
    this._root.innerHTML = "";

    if (!this._popup && !this._confirm) return;

    // ── Popup ─────────────────────────────────────────────────────────────────
    if (this._popup) {
      const { email, loading, body_html, body_text, error } = this._popup;
      const nm  = senderName(email.from);
      const col = avatarColor(nm);
      const bz  = this._busy.has(email.id);

      let bodyHtml;
      this._pendingIframeHtml = null;
      if (loading) {
        bodyHtml = `<div class="eic-loading">${I.spin}<span>Loading message…</span></div>`;
      } else if (error) {
        bodyHtml = `<div class="eic-err">⚠️ Could not load message<code>${esc(error)}</code></div>`;
      } else if (body_html) {
        bodyHtml = `<iframe class="eic-iframe" id="eic-iframe" sandbox="allow-same-origin allow-scripts"></iframe>`;
        this._pendingIframeHtml = body_html;
      } else {
        bodyHtml = `<div class="eic-plain">${esc(body_text || email.snippet || "(No content)")}</div>`;
      }

      // Backdrop is a separate div BEHIND the dialog.
      // Clicking it closes the popup. The dialog itself is a sibling, not a child,
      // so clicks on buttons inside the dialog never reach the backdrop at all.
      const backdrop = document.createElement("div");
      backdrop.className = "eic-backdrop";
      backdrop.addEventListener("click", () => this._closePopup());
      this._root.appendChild(backdrop);

      const dialog = document.createElement("div");
      dialog.className = "eic-dialog";
      dialog.innerHTML = `
        <button class="eic-x" id="eic-x" title="Close">${I.close}</button>
        <div class="eic-hdr">
          <div class="eic-av" style="background:${col}">${esc(initials(nm))}</div>
          <div class="eic-hi">
            <p class="eic-subj">${esc(email.subject || "(No Subject)")}</p>
            <div class="eic-from"><strong>${esc(nm)}</strong> &lt;${esc(senderAddr(email.from))}&gt;</div>
            <div class="eic-date">${fmtDate(email.date)}</div>
          </div>
        </div>
        <div class="eic-btns">
          ${email.unread
            ? `<button class="eic-btn r" id="eic-markread" data-id="${esc(email.id)}" ${bz?"disabled":""}>${I.check} Mark read</button>`
            : ""}
          <button class="eic-btn d" id="eic-del" data-id="${esc(email.id)}" data-subject="${esc(email.subject||"")}" ${bz?"disabled":""}>${I.trash} Delete</button>
        </div>
        <div class="eic-body">${bodyHtml}</div>`;
      this._root.appendChild(dialog);

      // ── Bind popup buttons using direct element references (no querySelector ID lookup) ──
      dialog.querySelector("#eic-x")
        .addEventListener("click", () => this._closePopup());

      const mrBtn = dialog.querySelector("#eic-markread");
      if (mrBtn) {
        const id = mrBtn.dataset.id;
        mrBtn.addEventListener("click", () => this._doService("mark_read", id));
      }

      const delBtn = dialog.querySelector("#eic-del");
      if (delBtn) {
        const id      = delBtn.dataset.id;
        const subject = delBtn.dataset.subject;
        delBtn.addEventListener("click", () => this._askDelete(id, subject));
      }

      // Load iframe via Blob URL
      const iframe = dialog.querySelector("#eic-iframe");
      if (iframe && this._pendingIframeHtml) {
        const html = this._pendingIframeHtml;
        this._pendingIframeHtml = null;
        const blob    = new Blob([html], { type:"text/html;charset=utf-8" });
        const blobUrl = URL.createObjectURL(blob);
        iframe.addEventListener("load", () => {
          URL.revokeObjectURL(blobUrl);
          try {
            const h = iframe.contentDocument?.documentElement?.scrollHeight
                   || iframe.contentDocument?.body?.scrollHeight;
            if (h) iframe.style.height = Math.min(h + 32, 600) + "px";
          } catch {}
        }, { once:true });
        iframe.src = blobUrl;
      }
    }

    // ── Confirm dialog ────────────────────────────────────────────────────────
    if (this._confirm) {
      const { id, subject } = this._confirm;

      const confBackdrop = document.createElement("div");
      confBackdrop.className = "eic-conf-backdrop";
      confBackdrop.addEventListener("click", () => {
        this._confirm = null;
        this._renderOverlay();
      });
      this._root.appendChild(confBackdrop);

      const box = document.createElement("div");
      box.className = "eic-conf-box";
      box.innerHTML = `
        <h3>Delete this email?</h3>
        <div class="eic-conf-prev">${esc(subject)}</div>
        <p>The message will be moved to Trash / Deleted Items.</p>
        <div class="eic-conf-row">
          <button class="eic-conf-btn cancel" id="eic-cancel">Cancel</button>
          <button class="eic-conf-btn del"    id="eic-ok">Delete</button>
        </div>`;
      this._root.appendChild(box);

      // Direct element reference binding — no querySelector id games
      box.querySelector("#eic-cancel").addEventListener("click", () => {
        this._confirm = null;
        this._renderOverlay();
      });
      box.querySelector("#eic-ok").addEventListener("click", () => {
        this._doService("delete_email", id);
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
  description: "Full-width unread email strip with popup reader, delete and mark-read. Mobile-optimised.",
  preview:     false,
});

console.info(
  `%c EMAIL-INBOX-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#6366f1;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:bold",
  "color:#6366f1;background:#f1f5f9;padding:2px 6px;border-radius:0 4px 4px 0"
);
