/* ============================================================
   Premium Confirmation Register — Minisure / Alertsure bords
   Vanilla JS + Supabase. No build step, no login.
   ============================================================ */

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const KNOWN_HEADERS = {
  client:   ["client","insured","insured name","name"],
  office:   ["office","branch"],
  class:    ["class","class of business"],
  banked:   ["gwp banked","banked"],
  withheld: ["gwp withheld","withheld"],
  datepaid: ["date paid","paid date","date"],
  comment:  ["comment","payment method","method"],
  basic:    ["basic premium","premium"]
};

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
const state = {
  view: "confirm",
  sb: null,               // supabase client
  connected: false,
  connError: null,
  upload: {               // in-progress upload wizard state
    fileType: "usd_bord",
    workbook: null,
    fileName: null,
    sheetName: null,
    rows: [],              // parsed + mapped rows ready to insert
    sheetsSkipped: 0,
    month: "",
    year: new Date().getFullYear(),
    category: "Comprehensive",
    reinsurance: "100% Retained",
    saving: false,
    progressText: null
  },
  search: {
    term: "",
    month: "",              // "" = any month
    year: new Date().getFullYear(),
    currency: "",            // "" = any currency
    category: "",            // "" = any category
    coverStart: "",          // claim's cover start date (YYYY-MM-DD), optional
    coverEnd: "",            // claim's cover end date (YYYY-MM-DD), optional
    results: [],
    selected: null,
    loading: false,
    note: null               // e.g. "Found in August 2026 (1 month later)"
  },
  history: {
    items: [],
    loading: false
  }
};

// ---------------------------------------------------------------
// Supabase connection (config lives in localStorage — never in this file)
// ---------------------------------------------------------------
function getConfig(){
  try{
    return JSON.parse(localStorage.getItem("pct_config") || "null");
  }catch(e){ return null; }
}
function saveConfig(url, key){
  localStorage.setItem("pct_config", JSON.stringify({url, key}));
}
function clearConfig(){
  localStorage.removeItem("pct_config");
}

// ---------------------------------------------------------------
// Signature (whoever is using this browser signs confirmations as this)
// ---------------------------------------------------------------
function getSignature(){
  try{
    return JSON.parse(localStorage.getItem("pct_signature") || "null") || { name:"S. Moyo", title:"Finance Department" };
  }catch(e){ return { name:"S. Moyo", title:"Finance Department" }; }
}
function saveSignature(name, title){
  localStorage.setItem("pct_signature", JSON.stringify({name, title}));
}

async function initSupabase(){
  const cfg = getConfig();
  if(!cfg || !cfg.url || !cfg.key){
    state.connected = false;
    state.connError = "not-configured";
    updateConnBadge();
    return;
  }
  try{
    state.sb = window.supabase.createClient(cfg.url, cfg.key);
    const { error } = await state.sb.from("bord_uploads").select("id", { count: "exact", head: true });
    if(error) throw error;
    state.connected = true;
    state.connError = null;
  }catch(e){
    state.connected = false;
    state.connError = e.message || String(e);
  }
  updateConnBadge();
}

function updateConnBadge(){
  const dot = document.getElementById("sideConnDot");
  const txt = document.getElementById("sideConnText");
  if(!dot || !txt) return;
  dot.className = "conn-dot " + (state.connected ? "ok" : (state.connError === "not-configured" ? "" : "bad"));
  txt.textContent = state.connected ? "Connected" : (state.connError === "not-configured" ? "Not connected" : "Connection error");
}

// ---------------------------------------------------------------
// Utils
// ---------------------------------------------------------------
function normHeader(h){
  return String(h || "").toLowerCase().replace(/[^a-z0-9 ]/g,"").trim();
}
function matchHeaderIndex(headerRow, variants){
  const normVariants = variants.map(normHeader);
  // Prefer an exact header match first...
  for(let i=0;i<headerRow.length;i++){
    const h = normHeader(headerRow[i]);
    if(h && normVariants.includes(h)) return i;
  }
  // ...only fall back to substring matching if nothing matched exactly.
  for(let i=0;i<headerRow.length;i++){
    const h = normHeader(headerRow[i]);
    if(!h) continue;
    if(normVariants.some(v => h.includes(v))) return i;
  }
  return -1;
}
function excelSerialToDate(n){
  // Excel serial date (1900 system) -> JS Date
  const utcDays = Math.floor(n - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}
function parseDateCell(v){
  if(v === null || v === undefined || v === "") return null;
  if(v instanceof Date && !isNaN(v)) return v;
  if(typeof v === "number") return excelSerialToDate(v);
  if(typeof v === "string"){
    const s = v.trim();
    // dd/mm/yyyy
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if(m){
      let [_, d, mo, y] = m;
      y = y.length === 2 ? "20"+y : y;
      const dt = new Date(Number(y), Number(mo)-1, Number(d));
      if(!isNaN(dt)) return dt;
    }
    const dt2 = new Date(s);
    if(!isNaN(dt2)) return dt2;
  }
  return null;
}
function fmtDate(d){
  if(!d) return "—";
  const dt = (d instanceof Date) ? d : new Date(d);
  if(isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}
function isoDate(d){
  if(!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  if(isNaN(dt)) return null;
  return dt.toISOString().slice(0,10);
}
function fmtMoney(n, currency){
  if(n === null || n === undefined || isNaN(n)) return "—";
  const num = Number(n).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
  return (currency || "USD") + " " + num;
}
function toNumber(v){
  if(v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function escapeHtml(s){
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function toast(msg, isError){
  const root = document.getElementById("toastRoot");
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 3600);
}
function guessPeriodFromSheetName(name){
  const s = String(name || "");
  const yearM = s.match(/(20\d{2})/);
  const year = yearM ? Number(yearM[1]) : new Date().getFullYear();
  let month = "";
  for(const m of MONTHS){
    if(s.toLowerCase().includes(m.toLowerCase()) || s.toLowerCase().includes(m.slice(0,3).toLowerCase())){
      month = m; break;
    }
  }
  return { month, year };
}
function guessCurrencyFromFilename(name){
  const s = String(name || "").toLowerCase();
  if(s.includes("zwg") || s.includes("zwl")) return "ZWG";
  return "USD";
}
function shiftPeriod(month, year, offset){
  const idx = MONTHS.indexOf(month);
  const total = idx + offset;
  const newYear = year + Math.floor(total / 12);
  const newIdx = ((total % 12) + 12) % 12;
  return { month: MONTHS[newIdx], year: newYear };
}

// ---------------------------------------------------------------
// Router
// ---------------------------------------------------------------
function setView(v){
  state.view = v;
  document.querySelectorAll(".nav-item").forEach(b=>{
    b.classList.toggle("active", b.dataset.view === v);
  });
  render();
}
document.addEventListener("click", (e)=>{
  const navBtn = e.target.closest(".nav-item");
  if(navBtn){ setView(navBtn.dataset.view); }
});

function render(){
  const root = document.getElementById("viewRoot");
  if(state.view === "confirm") root.innerHTML = renderConfirmView();
  else if(state.view === "upload") root.innerHTML = renderUploadView();
  else if(state.view === "history") root.innerHTML = renderHistoryView();
  else if(state.view === "settings") root.innerHTML = renderSettingsView();
  bindViewEvents();
}

// Boot
(async function(){
  const logoEl = document.getElementById("sidebarLogo");
  if(logoEl && typeof ZIMNAT_LOGO_DATA_URI !== "undefined") logoEl.src = ZIMNAT_LOGO_DATA_URI;
  document.querySelectorAll(".nav-item")[0].classList.add("active");
  await initSupabase();
  render();
  if(state.view === "history") loadHistory();
})();

// ---------------------------------------------------------------
// VIEW: Confirm a premium (Claims)
// ---------------------------------------------------------------
function renderConfirmView(){
  const s = state.search;
  let resultsHtml = "";

  if(s.loading){
    resultsHtml = `<div class="empty-state"><div class="spinner" style="border-color:rgba(27,42,57,0.2); border-top-color:var(--navy); margin:0 auto 12px;"></div><p>Searching the register…</p></div>`;
  } else if(s.term && s.results.length === 0){
    resultsHtml = `
      <div class="empty-state">
        <div class="es-icon">🔍</div>
        <h3>No record for "${escapeHtml(s.term)}"</h3>
        <p>${s.note ? escapeHtml(s.note) : "Check the spelling or registration number, or confirm this business was written through Minisure/Alertsure — finance may not have uploaded that month's bord yet."}</p>
      </div>`;
  } else if(s.results.length > 0){
    const noteHtml = s.note ? `<div class="step-note" style="margin-top:14px;">${escapeHtml(s.note)}</div>` : "";
    resultsHtml = noteHtml + `<div class="result-list">` + s.results.map((r,i)=>`
      <div class="result-item" data-idx="${i}">
        <div>
          <div class="rname">${escapeHtml(r.client_raw)}</div>
          <div class="rmeta">${escapeHtml(r.office || "—")} · ${escapeHtml(r.class || "—")}${r.category ? " · " + escapeHtml(r.category) : ""} · ${escapeHtml(r.period)} · paid ${fmtDate(r.date_paid)}</div>
        </div>
        <div class="ramt">${fmtMoney(r.amount, r.currency)}</div>
      </div>
    `).join("") + `</div>`;
  } else if(!s.term){
    resultsHtml = `
      <div class="empty-state">
        <div class="es-icon">📄</div>
        <h3>Search by insured name or registration number</h3>
        <p>Pick a month to search that bord first — if there's no match, the register automatically checks up to 2 months either side before giving up. Leave month on "Any" to search everything at once.</p>
      </div>`;
  }

  const certHtml = s.selected ? renderCertificate(s.selected, s.coverStart, s.coverEnd) : "";
  const yearOptions = yearOptionsAround(s.year);

  return `
    <div class="view">
      <div class="page-head">
        <h1>Confirm a premium</h1>
        <p>Enter the insured's name or vehicle registration number to check whether their premium has been received.</p>
      </div>
      <div class="panel">
        <div class="search-row">
          <input type="text" id="searchInput" placeholder="e.g. AEM9817 or T. Machiridza" value="${escapeHtml(s.term)}" autofocus>
          <button class="btn btn-primary" id="searchBtn">Search</button>
        </div>
        <div class="field-row" style="margin-top:14px;">
          <div class="field">
            <label>Month</label>
            <select id="searchMonth">
              <option value="" ${s.month===""?"selected":""}>Any month</option>
              ${MONTHS.map(m=>`<option value="${m}" ${m===s.month?"selected":""}>${m}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Year</label>
            <select id="searchYear" ${s.month === "" ? "disabled" : ""}>
              ${yearOptions.map(y=>`<option value="${y}" ${y===s.year?"selected":""}>${y}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Currency</label>
            <select id="searchCurrency">
              <option value="" ${s.currency===""?"selected":""}>Any currency</option>
              <option value="USD" ${s.currency==="USD"?"selected":""}>USD</option>
              <option value="ZWG" ${s.currency==="ZWG"?"selected":""}>ZWG</option>
            </select>
          </div>
          <div class="field">
            <label>Category</label>
            <select id="searchCategory">
              <option value="" ${s.category===""?"selected":""}>Any category</option>
              <option value="Comprehensive" ${s.category==="Comprehensive"?"selected":""}>Comprehensive</option>
              <option value="Third Party" ${s.category==="Third Party"?"selected":""}>Third Party</option>
            </select>
          </div>
        </div>
        <div class="field-row" style="margin-top:10px;">
          <div class="field">
            <label>Cover start date</label>
            <input type="date" id="coverStartInput" value="${escapeHtml(s.coverStart)}">
          </div>
          <div class="field">
            <label>Cover end date</label>
            <input type="date" id="coverEndInput" value="${escapeHtml(s.coverEnd)}">
          </div>
        </div>
        <div class="step-note">Optional — enter the claim's cover dates and the confirmation below will check the premium was paid on or before the cover start date.</div>
        ${resultsHtml}
      </div>
      ${certHtml}
    </div>
  `;
}
function yearOptionsAround(centerYear){
  const years = [];
  for(let y = centerYear - 2; y <= centerYear + 1; y++) years.push(y);
  return years;
}

function renderCertificate(r, coverStart, coverEnd){
  const sig = getSignature();
  const signatureBlock = (sig.name || sig.title)
    ? `\n\nRegards,\n${[sig.name, sig.title].filter(Boolean).join("\n")}`
    : "";

  // If claims supplied a cover start date, the premium must have been paid
  // on or before it. Paid later than cover start → flag for Finance instead
  // of auto-confirming.
  const hasCoverCheck = !!coverStart;
  const paidLate = hasCoverCheck && r.date_paid && r.date_paid > coverStart;

  if(paidLate){
    const noteText =
`Premium confirmation check — needs Finance review

Insured: ${r.client_raw}
Date paid: ${fmtDate(r.date_paid)}
Cover start date entered: ${fmtDate(coverStart)}

The premium was paid after the cover start date, so this cannot be auto-confirmed. Please contact Finance for confirmation.${signatureBlock}`;

    return `
      <div class="certificate">
        <div class="cert-head" style="background:var(--amber);">
          <div class="cert-head-left">
            <div class="cert-head-logo">
              <img src="${ZIMNAT_LOGO_DATA_URI}" alt="Zimnat General Insurance">
            </div>
            <div>
              <div class="cert-title">Please contact Finance for confirmation</div>
              <div class="cert-sub">Payment date is after the cover start date entered</div>
            </div>
          </div>
          <div class="cert-seal" style="border-color:#fff; color:#fff;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          </div>
        </div>
        <div class="cert-body">
          <h2 class="cert-name">${escapeHtml(r.client_raw)}</h2>
          <div class="cert-grid">
            <div class="cert-field">
              <div class="fl">Date paid</div>
              <div class="fv">${fmtDate(r.date_paid)}</div>
            </div>
            <div class="cert-field">
              <div class="fl">Cover start date entered</div>
              <div class="fv">${fmtDate(coverStart)}</div>
            </div>
          </div>
          <p class="step-note" style="margin-top:16px; font-size:13px;">The premium for this policy was paid <strong>after</strong> the cover start date you entered, so it can't be automatically confirmed as paid in advance of cover. Please contact Finance directly to confirm this one.</p>
          <div class="reply-box" id="replyText">${escapeHtml(noteText)}</div>
        </div>
        <div class="cert-foot">
          <div class="period">Bord period: ${escapeHtml(r.period)}</div>
          <div class="cert-actions">
            <button class="btn btn-ghost btn-sm" id="copyReplyBtn">Copy note</button>
            <button class="btn btn-ghost btn-sm" id="printCertBtn">Print</button>
          </div>
        </div>
      </div>
    `;
  }

  const rangeNote = hasCoverCheck
    ? `\nPaid on or before the cover start date (${fmtDate(coverStart)}${coverEnd ? " – " + fmtDate(coverEnd) : ""}).`
    : "";

  const replyText =
`Premium Confirmation

Insured: ${r.client_raw}
Amount paid: ${fmtMoney(r.amount, r.currency)}
Date paid: ${fmtDate(r.date_paid)}
Payment method: ${r.payment_method || "—"}
Class of business: ${r.class || "—"}${r.category ? " (" + r.category + ")" : ""}
Branch: ${r.office || "—"}
Reinsurance status: ${r.reinsurance_status || "100% Retained"}
Bord period: ${r.period}${rangeNote}${signatureBlock}`;

  return `
    <div class="certificate">
      <div class="cert-head">
        <div class="cert-head-left">
          <div class="cert-head-logo">
            <img src="${ZIMNAT_LOGO_DATA_URI}" alt="Zimnat General Insurance">
          </div>
          <div>
            <div class="cert-title">Premium confirmation</div>
            <div class="cert-sub">Finance Operations</div>
          </div>
        </div>
        <div class="cert-seal">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4L19 7"/></svg>
        </div>
      </div>
      <div class="cert-body">
        <h2 class="cert-name">${escapeHtml(r.client_raw)}</h2>
        <div class="cert-grid">
          <div class="cert-field amount">
            <div class="fl">Amount paid</div>
            <div class="fv">${fmtMoney(r.amount, r.currency)}</div>
          </div>
          <div class="cert-field">
            <div class="fl">Date paid</div>
            <div class="fv">${fmtDate(r.date_paid)}</div>
          </div>
          <div class="cert-field">
            <div class="fl">Payment method</div>
            <div class="fv">${escapeHtml(r.payment_method || "—")}</div>
          </div>
          <div class="cert-field ri">
            <div class="fl">Reinsurance status</div>
            <div class="fv">${escapeHtml(r.reinsurance_status || "100% Retained")}</div>
          </div>
          <div class="cert-field">
            <div class="fl">Class of business</div>
            <div class="fv">${escapeHtml(r.class || "—")}${r.category ? ` <span class="tag" style="margin-left:4px;">${escapeHtml(r.category)}</span>` : ""}</div>
          </div>
          <div class="cert-field">
            <div class="fl">Branch</div>
            <div class="fv">${escapeHtml(r.office || "—")}</div>
          </div>
        </div>
        ${hasCoverCheck ? `<div class="tag" style="margin-top:16px;">✓ Paid on or before cover start (${escapeHtml(fmtDate(coverStart))})</div>` : ""}
        <div class="reply-box" id="replyText">${escapeHtml(replyText)}</div>
      </div>
      <div class="cert-foot">
        <div class="period">Bord period: ${escapeHtml(r.period)}</div>
        <div class="cert-actions">
          <button class="btn btn-ghost btn-sm" id="copyReplyBtn">Copy reply text</button>
          <button class="btn btn-ghost btn-sm" id="printCertBtn">Print</button>
        </div>
      </div>
    </div>
  `;
}

const SEARCH_EXPAND_RANGE = 2; // "2 months backwards and forward"

async function runSearch(term){
  state.search.term = term;
  state.search.selected = null;
  state.search.note = null;
  if(!term || term.trim().length < 2){
    state.search.results = [];
    render();
    return;
  }
  if(!state.sb || !state.connected){
    toast("Not connected to the register yet — check Settings.", true);
    return;
  }
  state.search.loading = true;
  render();

  const cleanTerm = term.trim();
  const { month, year, currency, category } = state.search;

  try{
    if(!month){
      // No month picked — search the whole register, most recent first.
      let q = state.sb.from("bord_entries").select("*").ilike("client_raw", `%${cleanTerm}%`);
      if(currency) q = q.eq("currency", currency);
      if(category) q = q.eq("category", category);
      const { data, error } = await q.order("date_paid", { ascending: false }).limit(50);
      if(error) throw error;
      state.search.results = data || [];
      state.search.note = null;
    } else {
      // Month picked — search that bord first, then expand outward until a match turns up.
      const offsets = [0];
      for(let d = 1; d <= SEARCH_EXPAND_RANGE; d++){ offsets.push(-d, d); }
      let found = null, foundOffset = 0, checkedPeriods = [];

      for(const offset of offsets){
        const target = shiftPeriod(month, year, offset);
        const period = `${target.month} ${target.year}`;
        checkedPeriods.push(period);
        let q = state.sb.from("bord_entries").select("*")
          .ilike("client_raw", `%${cleanTerm}%`)
          .eq("period", period);
        if(currency) q = q.eq("currency", currency);
        if(category) q = q.eq("category", category);
        const { data, error } = await q.order("date_paid", { ascending:false }).limit(50);
        if(error) throw error;
        if(data && data.length){ found = data; foundOffset = offset; break; }
      }

      state.search.results = found || [];
      if(found && foundOffset !== 0){
        const dir = foundOffset > 0 ? "later" : "earlier";
        const n = Math.abs(foundOffset);
        state.search.note = `No match in ${month} ${year} — found ${n} month${n>1?"s":""} ${dir}, in ${found[0].period}.`;
      } else if(!found){
        state.search.note = `Searched ${month} ${year} and ${SEARCH_EXPAND_RANGE} months either side (${checkedPeriods[checkedPeriods.length-2]} to ${checkedPeriods[checkedPeriods.length-1]}) — no match. Widen the year, clear the month filter, or check with finance whether that bord has been uploaded.`;
      } else {
        state.search.note = null;
      }
    }
  }catch(error){
    toast("Search failed: " + error.message, true);
    state.search.results = [];
  }

  state.search.loading = false;
  render();
}

// ---------------------------------------------------------------
// VIEW: Upload a bord (Finance)
// ---------------------------------------------------------------
const FILE_TYPES = {
  usd_bord: {
    label: "USD Bord (Comprehensive)",
    filenameHint: '"June 2026 USD Bord.xlsx"',
    currency: "USD",
    defaultCategory: "Comprehensive"
  },
  usd_third_party: {
    label: "USD Sales Report (Third Party)",
    filenameHint: '"June USD Sales Report.xlsx"',
    currency: "USD",
    defaultCategory: "Third Party"
  },
  zwg: {
    label: "ZWG Final Sales Report",
    filenameHint: '"June 2026 Final Sales Report.xlsx"',
    currency: "ZWG",
    defaultCategory: "Third Party"
  }
};

function matchAllHeaderIndices(headerRow, variants){
  const normVariants = variants.map(normHeader);
  const found = [];
  for(let i=0;i<headerRow.length;i++){
    const h = normHeader(headerRow[i]);
    if(!h) continue;
    if(normVariants.some(v => h === v)) found.push(i);
  }
  return found;
}
function sumIndices(row, indices){
  let total = 0, any = false;
  for(const i of indices){
    const n = toNumber(row[i]);
    if(n !== null){ total += n; any = true; }
  }
  return any ? total : null;
}

function renderUploadView(){
  const u = state.upload;
  const ft = FILE_TYPES[u.fileType];

  const typeSelector = `
    <div class="field-row">
      <div class="field" style="flex:1 1 100%;">
        <label>What kind of file is this?</label>
        <select id="fileTypeSelect">
          ${Object.entries(FILE_TYPES).map(([key,v])=>`<option value="${key}" ${key===u.fileType?"selected":""}>${v.label}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="step-note">Expect a filename like ${ft.filenameHint}. Currency is fixed by the file type: ${ft.currency}.</div>
  `;

  let sheetPicker = "";
  if(u.workbook && u.fileType === "usd_bord"){
    sheetPicker = `
      <div class="field-row">
        <div class="field">
          <label>Sheet in this workbook</label>
          <select id="sheetSelect">
            ${u.workbook.SheetNames.map(n=>`<option value="${escapeHtml(n)}" ${n===u.sheetName?"selected":""}>${escapeHtml(n)}</option>`).join("")}
          </select>
        </div>
      </div>
    `;
  }

  let periodFields = "";
  if(u.workbook){
    periodFields = `
      <div class="field-row">
        <div class="field">
          <label>Month</label>
          <select id="monthSelect">
            ${MONTHS.map(m=>`<option value="${m}" ${m===u.month?"selected":""}>${m}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Year</label>
          <input type="number" id="yearInput" value="${u.year}">
        </div>
        <div class="field">
          <label>Currency</label>
          <input type="text" value="${ft.currency}" disabled>
        </div>
        <div class="field">
          <label>Category</label>
          <select id="categorySelect">
            <option value="Comprehensive" ${u.category==="Comprehensive"?"selected":""}>Comprehensive</option>
            <option value="Third Party" ${u.category==="Third Party"?"selected":""}>Third Party</option>
          </select>
        </div>
        <div class="field">
          <label>Reinsurance status</label>
          <input type="text" id="reinsuranceInput" value="${escapeHtml(u.reinsurance)}">
        </div>
      </div>
      ${u.fileType === "usd_third_party" ? '<div class="step-note">This filename has no year in it — double-check the year above before saving.</div>' : ""}
      <div class="step-note">Category and reinsurance status apply to every policy in this upload. If a file is a genuine mix, upload it in two passes so each batch gets the right tag.</div>
    `;
  }

  let progressHtml = "";
  if(u.progressText){
    progressHtml = `
      <div class="divider"></div>
      <div class="empty-state"><div class="spinner" style="border-color:rgba(27,42,57,0.2); border-top-color:var(--navy); margin:0 auto 12px;"></div><p>${escapeHtml(u.progressText)}</p></div>
    `;
  }

  let previewHtml = "";
  if(!u.progressText && u.rows.length){
    const rowsShown = u.rows.slice(0, 200);
    previewHtml = `
      <div class="divider"></div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div><span class="tag">${u.rows.length} polic${u.rows.length===1?"y":"ies"} found${u.sheetsSkipped ? ` · ${u.sheetsSkipped} sheet${u.sheetsSkipped===1?"":"s"} skipped (no matching columns)` : ""}</span></div>
        <div class="step-note" style="margin:0;">${u.rows.length > 200 ? "Showing first 200 rows" : ""}</div>
      </div>
      <div class="preview-wrap">
        <table class="preview">
          <thead><tr>
            <th>Client</th><th>Office</th><th>Class</th><th>Category</th><th>Amount</th><th>Date paid</th><th>Method</th>
          </tr></thead>
          <tbody>
            ${rowsShown.map(r=>`
              <tr>
                <td>${escapeHtml(r.client_raw)}</td>
                <td>${escapeHtml(r.office||"")}</td>
                <td>${escapeHtml(r.class||"")}</td>
                <td>${escapeHtml(u.category)}</td>
                <td>${fmtMoney(r.amount, ft.currency)}</td>
                <td>${fmtDate(r.date_paid)}</td>
                <td>${escapeHtml(r.payment_method||"")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="step-note">Rows with no client name or reg number (subtotal/summary lines) are skipped automatically. Review a sample above, then save to the register.</div>
      <div style="margin-top:16px; display:flex; gap:10px;">
        <button class="btn btn-primary" id="saveUploadBtn" ${u.saving ? "disabled" : ""}>
          ${u.saving ? '<span class="spinner"></span> Saving…' : "Save to register"}
        </button>
        <button class="btn btn-ghost" id="cancelUploadBtn" ${u.saving ? "disabled" : ""}>Start over</button>
      </div>
    `;
  }

  return `
    <div class="view">
      <div class="page-head">
        <h1>Upload a bord</h1>
        <p>Upload this month's Minisure/Alertsure file. Every policy line becomes searchable by claims immediately after you save.</p>
      </div>
      <div class="panel">
        ${typeSelector}
        <label class="drop" id="dropZone">
          <input type="file" id="fileInput" accept=".xlsx,.xls">
          <div class="di">📤</div>
          <div class="dt">${u.fileName ? escapeHtml(u.fileName) : "Click to choose a workbook"}</div>
          <div class="ds">.xlsx — for a ${ft.label} file</div>
        </label>
        ${sheetPicker}
        ${periodFields}
        ${progressHtml}
        ${previewHtml}
      </div>
    </div>
  `;
}

function handleWorkbook(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type:"array", cellDates:true });
      const u = state.upload;
      u.workbook = wb;
      u.fileName = file.name;
      u.rows = [];
      u.sheetsSkipped = 0;

      if(u.fileType === "usd_bord"){
        const dataSheet = wb.SheetNames.find(n => !/renewal|cumulative|comm|sheet\d/i.test(n)) || wb.SheetNames[0];
        u.sheetName = dataSheet;
        const guess = guessPeriodFromSheetName(dataSheet);
        u.month = guess.month || MONTHS[new Date().getMonth()];
        u.year = guess.year;
        parseUsdBordSheet();
      } else if(u.fileType === "usd_third_party"){
        const guess = guessPeriodFromSheetName(file.name);
        u.month = guess.month || MONTHS[new Date().getMonth()];
        // this filename has no year — keep whatever year was already set (default: current year)
        parseUsdThirdParty();
      } else if(u.fileType === "zwg"){
        const guess = guessPeriodFromSheetName(file.name);
        u.month = guess.month || MONTHS[new Date().getMonth()];
        u.year = guess.year;
        parseZwg();
      }
    }catch(err){
      toast("Couldn't read that file: " + err.message, true);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ---- Parser: USD Bord (Comprehensive) — single sheet ----
function parseUsdBordSheet(){
  const u = state.upload;
  const ws = u.workbook.Sheets[u.sheetName];
  const grid = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });

  let headerRowIdx = -1, colMap = null;
  for(let i=0;i<Math.min(5, grid.length);i++){
    const idx = matchHeaderIndex(grid[i], KNOWN_HEADERS.client);
    if(idx !== -1){
      headerRowIdx = i;
      colMap = {
        client:   idx,
        office:   matchHeaderIndex(grid[i], KNOWN_HEADERS.office),
        class:    matchHeaderIndex(grid[i], KNOWN_HEADERS.class),
        banked:   matchHeaderIndex(grid[i], KNOWN_HEADERS.banked),
        withheld: matchHeaderIndex(grid[i], KNOWN_HEADERS.withheld),
        datepaid: matchHeaderIndex(grid[i], KNOWN_HEADERS.datepaid),
        comment:  matchHeaderIndex(grid[i], KNOWN_HEADERS.comment),
        basic:    matchHeaderIndex(grid[i], KNOWN_HEADERS.basic)
      };
      break;
    }
  }
  if(headerRowIdx === -1){
    toast("Couldn't find a Client/Insured column on this sheet — try picking a different sheet.", true);
    u.rows = [];
    render();
    return;
  }

  const rows = [];
  for(let i=headerRowIdx+1; i<grid.length; i++){
    const row = grid[i];
    if(!row) continue;
    const client = row[colMap.client];
    if(client === null || client === undefined || String(client).trim() === "") continue;
    const banked = colMap.banked !== -1 ? toNumber(row[colMap.banked]) : null;
    const withheld = colMap.withheld !== -1 ? toNumber(row[colMap.withheld]) : null;
    rows.push({
      client_raw: String(client).trim(),
      office: colMap.office !== -1 ? (row[colMap.office] ?? null) : null,
      class: colMap.class !== -1 ? (row[colMap.class] ?? null) : null,
      amount: banked !== null ? banked : withheld,
      date_paid: colMap.datepaid !== -1 ? parseDateCell(row[colMap.datepaid]) : null,
      payment_method: colMap.comment !== -1 ? (row[colMap.comment] ?? null) : null,
      basic_premium: colMap.basic !== -1 ? toNumber(row[colMap.basic]) : null
    });
  }
  u.rows = rows;
  render();
}

// ---- Parser: USD Sales Report (Third Party) — one sheet per day, named "1".."31" ----
function parseUsdThirdParty(){
  const u = state.upload;
  const rows = [];
  let sheetsSkipped = 0;

  for(const sheetName of u.workbook.SheetNames){
    const day = Number(sheetName.trim());
    if(!Number.isInteger(day) || day < 1 || day > 31){ sheetsSkipped++; continue; }

    const ws = u.workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
    if(!grid.length){ sheetsSkipped++; continue; }

    const header = grid[0];
    const regIdx = matchHeaderIndex(header, ["reg number","registration number","reg no","reg"]);
    if(regIdx === -1){ sheetsSkipped++; continue; }

    const officeIdx = matchHeaderIndex(header, ["office"]);
    const nwpIdx = matchAllHeaderIndices(header, ["nwp"]);
    const stampIdx = matchAllHeaderIndices(header, ["stamp duty"]);
    const gvtIdx = matchAllHeaderIndices(header, ["gvt levy","government levy"]);
    // last text-ish column usually holds the payment method (DEPOSITED / SWIPED / ECOCASH)
    const methodIdx = header.length - 1;

    const monthIdx = MONTHS.indexOf(u.month);
    const datePaid = monthIdx !== -1 ? new Date(u.year, monthIdx, day) : null;

    let lastOffice = null;
    for(let i=1; i<grid.length; i++){
      const row = grid[i];
      if(!row) continue;
      const reg = row[regIdx];
      if(reg === null || reg === undefined || String(reg).trim() === "") continue;

      if(officeIdx !== -1 && row[officeIdx] !== null && row[officeIdx] !== undefined && String(row[officeIdx]).trim() !== ""){
        lastOffice = row[officeIdx];
      }

      const nwp = sumIndices(row, nwpIdx);
      const stamp = sumIndices(row, stampIdx);
      const gvt = sumIndices(row, gvtIdx);
      const amount = (nwp||0) + (stamp||0) + (gvt||0);
      if(nwp===null && stamp===null && gvt===null) continue; // no premium data on this line

      let method = null;
      for(let c = header.length - 1; c >= 0; c--){
        const v = row[c];
        if(typeof v === "string" && /deposit|swipe|ecocash|cash|eft|bank/i.test(v)){ method = v; break; }
      }

      rows.push({
        client_raw: String(reg).trim(),
        office: lastOffice,
        class: null,
        amount: amount,
        date_paid: datePaid,
        payment_method: method,
        basic_premium: null
      });
    }
  }

  u.rows = rows;
  u.sheetsSkipped = sheetsSkipped;
  render();
}

// ---- Parser: ZWG Final Sales Report — one sheet per branch/agent ----
function parseZwg(){
  const u = state.upload;
  const rows = [];
  let sheetsSkipped = 0;

  for(const sheetName of u.workbook.SheetNames){
    const ws = u.workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
    if(!grid.length){ sheetsSkipped++; continue; }

    // Primary schema: Customer_Name + VRN, Premium_Collected, Issue Date
    let headerRowIdx = -1, header = null;
    for(let i=0;i<Math.min(3, grid.length);i++){
      if(matchHeaderIndex(grid[i], ["customer_name","customer name"]) !== -1){ headerRowIdx = i; header = grid[i]; break; }
    }

    if(headerRowIdx !== -1){
      const nameIdx = matchHeaderIndex(header, ["customer_name","customer name"]);
      const vrnIdx = matchHeaderIndex(header, ["vrn"]);
      const premiumIdx = matchHeaderIndex(header, ["premium_collected","premium collected"]);
      const issueDateIdx = matchHeaderIndex(header, ["issue date"]);
      const methodIdx = matchHeaderIndex(header, ["payment method"]);
      const typeIdx = matchHeaderIndex(header, ["insurance_type","insurance type"]);
      if(premiumIdx === -1){ sheetsSkipped++; continue; }

      for(let i=headerRowIdx+1; i<grid.length; i++){
        const row = grid[i];
        if(!row) continue;
        const name = nameIdx !== -1 ? row[nameIdx] : null;
        const vrn = vrnIdx !== -1 ? row[vrnIdx] : null;
        if((name===null||String(name).trim()==="") && (vrn===null||String(vrn).trim()==="")) continue;
        const clientRaw = [name, vrn].filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(v=>String(v).trim()).join(" ");
        if(!clientRaw) continue;

        rows.push({
          client_raw: clientRaw,
          office: sheetName,
          class: typeIdx !== -1 ? (row[typeIdx] ?? null) : null,
          amount: toNumber(row[premiumIdx]),
          date_paid: issueDateIdx !== -1 ? parseDateCell(row[issueDateIdx]) : null,
          payment_method: methodIdx !== -1 ? (row[methodIdx] ?? null) : null,
          basic_premium: null
        });
      }
      continue;
    }

    // Alternate schema (seen on channel sheets like "Zimnat Whatsapp online"):
    // VRN + Amount + Transaction Date, no Customer_Name column.
    const altHeaderIdx = 0;
    const altHeader = grid[0];
    const vrnOnlyIdx = matchHeaderIndex(altHeader, ["vrn"]);
    const amountOnlyIdx = matchHeaderIndex(altHeader, ["amount"]);
    if(vrnOnlyIdx === -1 || amountOnlyIdx === -1){ sheetsSkipped++; continue; }

    const txDateIdx = matchHeaderIndex(altHeader, ["transaction date"]);
    const methodOnlyIdx = matchHeaderIndex(altHeader, ["payment method"]);

    for(let i=altHeaderIdx+1; i<grid.length; i++){
      const row = grid[i];
      if(!row) continue;
      const vrn = row[vrnOnlyIdx];
      if(vrn === null || vrn === undefined || String(vrn).trim() === "") continue;
      rows.push({
        client_raw: String(vrn).trim(),
        office: sheetName,
        class: null,
        amount: toNumber(row[amountOnlyIdx]),
        date_paid: txDateIdx !== -1 ? parseDateCell(row[txDateIdx]) : null,
        payment_method: methodOnlyIdx !== -1 ? (row[methodOnlyIdx] ?? null) : null,
        basic_premium: null
      });
    }
  }

  u.rows = rows;
  u.sheetsSkipped = sheetsSkipped;
  render();
}

async function saveUpload(){
  const u = state.upload;
  const ft = FILE_TYPES[u.fileType];
  if(!state.sb || !state.connected){
    toast("Not connected to the register — check Settings first.", true);
    return;
  }
  if(!u.rows.length) return;
  u.saving = true;
  render();

  const period = `${u.month} ${u.year}`;
  const currency = ft.currency;
  try{
    const { data: uploadRow, error: uploadErr } = await state.sb
      .from("bord_uploads")
      .insert({
        period, month: u.month, year: u.year, currency,
        category: u.category, source_file: u.fileName, row_count: u.rows.length
      })
      .select()
      .single();
    if(uploadErr) throw uploadErr;

    const payload = u.rows.map(r => ({
      upload_id: uploadRow.id,
      period, month: u.month, year: u.year, currency,
      client_raw: r.client_raw,
      office: r.office,
      class: r.class,
      amount: r.amount,
      date_paid: isoDate(r.date_paid),
      payment_method: r.payment_method,
      basic_premium: r.basic_premium,
      category: u.category || null,
      reinsurance_status: u.reinsurance || "100% Retained"
    }));

    const chunkSize = 300;
    for(let i=0; i<payload.length; i+=chunkSize){
      u.progressText = `Saving… ${Math.min(i+chunkSize, payload.length)} of ${payload.length} rows`;
      render();
      const chunk = payload.slice(i, i+chunkSize);
      const { error: entriesErr } = await state.sb.from("bord_entries").insert(chunk);
      if(entriesErr) throw entriesErr;
    }

    toast(`Saved ${u.rows.length} policies for ${period} (${currency}).`);
    resetUpload();
  }catch(err){
    toast("Save failed: " + err.message, true);
    u.saving = false;
    u.progressText = null;
    render();
  }
}

function resetUpload(){
  state.upload = {
    fileType: "usd_bord",
    workbook:null, fileName:null, sheetName:null, rows:[], sheetsSkipped:0,
    month:"", year:new Date().getFullYear(),
    category:"Comprehensive", reinsurance:"100% Retained",
    saving:false, progressText:null
  };
  render();
}

// ---------------------------------------------------------------
// VIEW: Bord history (Finance)
// ---------------------------------------------------------------
function renderHistoryView(){
  const h = state.history;
  let body = "";
  if(h.loading){
    body = `<div class="empty-state"><div class="spinner" style="border-color:rgba(27,42,57,0.2); border-top-color:var(--navy); margin:0 auto 12px;"></div><p>Loading upload history…</p></div>`;
  } else if(!h.items.length){
    body = `
      <div class="empty-state">
        <div class="es-icon">🗂️</div>
        <h3>No bords uploaded yet</h3>
        <p>Once finance uploads a month's bord, it will appear here with a record count and the option to remove it if it was uploaded in error.</p>
      </div>`;
  } else {
    body = h.items.map(it => `
      <div class="hist-row">
        <div>
          <div class="hname">${escapeHtml(it.period)} <span class="tag" style="margin-left:6px;">${escapeHtml(it.currency)}</span>${it.category ? `<span class="tag" style="margin-left:4px;">${escapeHtml(it.category)}</span>` : ""}</div>
          <div class="hmeta">${it.row_count} polic${it.row_count===1?"y":"ies"} · ${escapeHtml(it.source_file || "")} · uploaded ${fmtDate(it.uploaded_at)}</div>
        </div>
        <button class="btn btn-danger btn-sm" data-del="${it.id}">Remove</button>
      </div>
    `).join("");
  }

  return `
    <div class="view wide">
      <div class="page-head">
        <h1>Bord history</h1>
        <p>Every bord that's been uploaded to the register. Remove one if it was uploaded twice or by mistake — this also removes its policies from search.</p>
      </div>
      <div class="panel">${body}</div>
    </div>
  `;
}

async function loadHistory(){
  if(!state.sb || !state.connected){ return; }
  state.history.loading = true;
  render();
  const { data, error } = await state.sb
    .from("bord_uploads")
    .select("*")
    .order("year", { ascending:false })
    .order("uploaded_at", { ascending:false });
  state.history.loading = false;
  if(error){
    toast("Couldn't load history: " + error.message, true);
  } else {
    state.history.items = data || [];
  }
  render();
}

async function deleteUpload(id){
  if(!confirm("Remove this bord and all its policy lines from the register? This can't be undone.")) return;
  const { error } = await state.sb.from("bord_uploads").delete().eq("id", id);
  if(error){ toast("Delete failed: " + error.message, true); return; }
  toast("Bord removed from the register.");
  loadHistory();
}

// ---------------------------------------------------------------
// VIEW: Settings
// ---------------------------------------------------------------
function renderSettingsView(){
  const cfg = getConfig();
  const sig = getSignature();
  let banner = "";
  if(state.connected){
    banner = `<div class="conn-banner ok">✓ Connected — finance and claims are sharing the same live register.</div>`;
  } else if(state.connError === "not-configured"){
    banner = `<div class="conn-banner pending">Not connected yet — add your Supabase project details below.</div>`;
  } else {
    banner = `<div class="conn-banner bad">Connection error: ${escapeHtml(state.connError || "")}</div>`;
  }

  return `
    <div class="view">
      <div class="page-head">
        <h1>Settings</h1>
        <p>This tool stores its data in a Supabase project so finance and claims always see the same register, from any device.</p>
      </div>

      ${banner}

      <div class="panel">
        <div class="field-row">
          <div class="field" style="flex:2;">
            <label>Supabase project URL</label>
            <input type="text" id="sbUrl" placeholder="https://xxxxx.supabase.co" value="${escapeHtml(cfg?.url || "")}">
          </div>
        </div>
        <div class="field-row">
          <div class="field" style="flex:2;">
            <label>Supabase anon public key</label>
            <input type="text" id="sbKey" placeholder="eyJhbGciOi..." value="${escapeHtml(cfg?.key || "")}">
          </div>
        </div>
        <div style="margin-top:14px; display:flex; gap:10px;">
          <button class="btn btn-primary" id="saveConnBtn">Save & connect</button>
          ${cfg ? '<button class="btn btn-ghost" id="clearConnBtn">Forget these details</button>' : ""}
        </div>
        <p class="step-note">Only the URL and the public anon key are stored, in this browser only. Every team member who opens this tool needs to enter the same two values once.</p>
      </div>

      <div class="panel">
        <h3 style="margin:0 0 8px 0; font-family:var(--serif); font-size:16px; color:var(--navy);">Signature on confirmations</h3>
        <p class="step-note" style="margin-top:0;">Added to the bottom of every reply text claims copies from a confirmation. Only stored in this browser — set your own name if someone else uses this tool.</p>
        <div class="field-row">
          <div class="field">
            <label>Name</label>
            <input type="text" id="sigName" placeholder="e.g. S. Moyo" value="${escapeHtml(sig.name || "")}">
          </div>
          <div class="field">
            <label>Title / Department</label>
            <input type="text" id="sigTitle" placeholder="e.g. Finance Department" value="${escapeHtml(sig.title || "")}">
          </div>
        </div>
        <div style="margin-top:14px;">
          <button class="btn btn-primary" id="saveSigBtn">Save signature</button>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin:0 0 8px 0; font-family:var(--serif); font-size:16px; color:var(--navy);">First-time setup</h3>
        <ol class="setup-steps">
          <li>Create a free project at <a href="https://supabase.com" target="_blank">supabase.com</a> (or reuse an existing Zimnat project).</li>
          <li>Open <strong>SQL Editor → New query</strong>, paste in the schema below, and run it once.</li>
          <li>Open <strong>Project Settings → API</strong>, copy the <strong>Project URL</strong> and the <strong>anon public</strong> key.</li>
          <li>Paste both above and click <strong>Save & connect</strong>.</li>
          <li>Share this tool's link (and the same URL + key) with the claims team and anyone else in finance.</li>
        </ol>
        <div class="sql-box" id="sqlBox">${escapeHtml(SETUP_SQL)}</div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" id="copySqlBtn">Copy SQL</button>
        </div>
      </div>
    </div>
  `;
}

const SETUP_SQL = `create extension if not exists pgcrypto;

create table if not exists bord_uploads (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  month text not null,
  year int not null,
  currency text not null default 'USD',
  category text,
  source_file text,
  row_count int not null default 0,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create table if not exists bord_entries (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references bord_uploads(id) on delete cascade,
  period text not null,
  month text not null,
  year int not null,
  currency text not null default 'USD',
  client_raw text not null,
  office text,
  class text,
  category text,
  amount numeric,
  date_paid date,
  payment_method text,
  basic_premium numeric,
  reinsurance_status text not null default '100% Retained',
  uploaded_at timestamptz not null default now()
);

create extension if not exists pg_trgm;
create index if not exists bord_entries_client_trgm on bord_entries using gin (client_raw gin_trgm_ops);
create index if not exists bord_entries_period_idx on bord_entries (period, currency);
create index if not exists bord_entries_category_idx on bord_entries (category);

alter table bord_uploads enable row level security;
alter table bord_entries enable row level security;

create policy "anon full access uploads" on bord_uploads for all using (true) with check (true);
create policy "anon full access entries" on bord_entries for all using (true) with check (true);

-- Already ran an earlier version of this schema? Run just these two lines:
-- alter table bord_uploads add column if not exists category text;
-- alter table bord_entries add column if not exists category text;`;

// ---------------------------------------------------------------
// Event binding (re-attached after every render)
// ---------------------------------------------------------------
function bindViewEvents(){
  // ---- Confirm view ----
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  if(searchInput){
    searchInput.addEventListener("keydown", (e)=>{
      if(e.key === "Enter") runSearch(searchInput.value);
    });
    searchInput.addEventListener("input", (e)=>{ state.search.term = e.target.value; });
  }
  if(searchBtn){
    searchBtn.addEventListener("click", ()=> runSearch(searchInput.value));
  }
  const searchMonth = document.getElementById("searchMonth");
  if(searchMonth){
    searchMonth.addEventListener("change", (e)=>{
      state.search.month = e.target.value;
      render(); // toggles the year dropdown's enabled state
    });
  }
  const searchYear = document.getElementById("searchYear");
  if(searchYear) searchYear.addEventListener("change", (e)=>{ state.search.year = Number(e.target.value); });
  const searchCurrency = document.getElementById("searchCurrency");
  if(searchCurrency) searchCurrency.addEventListener("change", (e)=>{ state.search.currency = e.target.value; });
  const searchCategory = document.getElementById("searchCategory");
  if(searchCategory) searchCategory.addEventListener("change", (e)=>{ state.search.category = e.target.value; });
  const coverStartInput = document.getElementById("coverStartInput");
  if(coverStartInput) coverStartInput.addEventListener("change", (e)=>{ state.search.coverStart = e.target.value; render(); });
  const coverEndInput = document.getElementById("coverEndInput");
  if(coverEndInput) coverEndInput.addEventListener("change", (e)=>{ state.search.coverEnd = e.target.value; render(); });
  document.querySelectorAll(".result-item").forEach(el=>{
    el.addEventListener("click", ()=>{
      const idx = Number(el.dataset.idx);
      state.search.selected = state.search.results[idx];
      render();
      setTimeout(()=>{
        document.querySelector(".certificate")?.scrollIntoView({behavior:"smooth", block:"nearest"});
      }, 30);
    });
  });
  const copyReplyBtn = document.getElementById("copyReplyBtn");
  if(copyReplyBtn){
    copyReplyBtn.addEventListener("click", ()=>{
      const text = document.getElementById("replyText").textContent;
      navigator.clipboard.writeText(text).then(()=> toast("Reply text copied."));
    });
  }
  const printCertBtn = document.getElementById("printCertBtn");
  if(printCertBtn){
    printCertBtn.addEventListener("click", ()=> window.print());
  }

  // ---- Upload view ----
  const fileTypeSelect = document.getElementById("fileTypeSelect");
  if(fileTypeSelect){
    fileTypeSelect.addEventListener("change", (e)=>{
      const newType = e.target.value;
      state.upload.fileType = newType;
      state.upload.category = FILE_TYPES[newType].defaultCategory;
      // switching type invalidates any already-parsed file — start clean but keep the picked type
      state.upload.workbook = null;
      state.upload.fileName = null;
      state.upload.sheetName = null;
      state.upload.rows = [];
      state.upload.sheetsSkipped = 0;
      render();
    });
  }
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  if(fileInput){
    fileInput.addEventListener("change", (e)=>{
      if(e.target.files[0]) handleWorkbook(e.target.files[0]);
    });
  }
  if(dropZone){
    dropZone.addEventListener("dragover", (e)=>{ e.preventDefault(); });
    dropZone.addEventListener("drop", (e)=>{
      e.preventDefault();
      if(e.dataTransfer.files[0]) handleWorkbook(e.dataTransfer.files[0]);
    });
  }
  const sheetSelect = document.getElementById("sheetSelect");
  if(sheetSelect){
    sheetSelect.addEventListener("change", (e)=>{
      state.upload.sheetName = e.target.value;
      const guess = guessPeriodFromSheetName(e.target.value);
      if(guess.month) state.upload.month = guess.month;
      state.upload.year = guess.year;
      parseUsdBordSheet();
    });
  }
  const monthSelect = document.getElementById("monthSelect");
  if(monthSelect) monthSelect.addEventListener("change", (e)=>{
    state.upload.month = e.target.value;
    if(state.upload.fileType === "usd_third_party") parseUsdThirdParty();
  });
  const yearInput = document.getElementById("yearInput");
  if(yearInput) yearInput.addEventListener("change", (e)=>{
    state.upload.year = Number(e.target.value);
    if(state.upload.fileType === "usd_third_party") parseUsdThirdParty();
  });
  const categorySelect = document.getElementById("categorySelect");
  if(categorySelect) categorySelect.addEventListener("change", (e)=>{ state.upload.category = e.target.value; render(); });
  const reinsuranceInput = document.getElementById("reinsuranceInput");
  if(reinsuranceInput) reinsuranceInput.addEventListener("change", (e)=>{ state.upload.reinsurance = e.target.value; });
  const saveUploadBtn = document.getElementById("saveUploadBtn");
  if(saveUploadBtn) saveUploadBtn.addEventListener("click", saveUpload);
  const cancelUploadBtn = document.getElementById("cancelUploadBtn");
  if(cancelUploadBtn) cancelUploadBtn.addEventListener("click", resetUpload);

  // ---- History view ----
  document.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=> deleteUpload(btn.dataset.del));
  });
  if(state.view === "history" && !state.history.items.length && !state.history.loading){
    loadHistory();
  }

  // ---- Settings view ----
  const saveConnBtn = document.getElementById("saveConnBtn");
  if(saveConnBtn){
    saveConnBtn.addEventListener("click", async ()=>{
      const url = document.getElementById("sbUrl").value.trim();
      const key = document.getElementById("sbKey").value.trim();
      if(!url || !key){ toast("Enter both the project URL and the anon key.", true); return; }
      saveConfig(url, key);
      toast("Connecting…");
      await initSupabase();
      render();
      if(state.connected) toast("Connected to the register.");
    });
  }
  const clearConnBtn = document.getElementById("clearConnBtn");
  if(clearConnBtn){
    clearConnBtn.addEventListener("click", ()=>{
      clearConfig();
      state.sb = null; state.connected = false; state.connError = "not-configured";
      updateConnBadge();
      render();
    });
  }
  const saveSigBtn = document.getElementById("saveSigBtn");
  if(saveSigBtn){
    saveSigBtn.addEventListener("click", ()=>{
      const name = document.getElementById("sigName").value.trim();
      const title = document.getElementById("sigTitle").value.trim();
      saveSignature(name, title);
      toast("Signature saved.");
    });
  }
  const copySqlBtn = document.getElementById("copySqlBtn");
  if(copySqlBtn){
    copySqlBtn.addEventListener("click", ()=>{
      navigator.clipboard.writeText(SETUP_SQL).then(()=> toast("SQL copied."));
    });
  }
}
