// SMART on FHIR (OAuth2 + PKCE) client for Epic — no dependencies.
// Uses only the APIs enabled on the Epic app:
//   Patient.Read · Observation.Search (Vital Signs, Labs) · Observation.Read · MedicationRequest.Search

const SANDBOX_ISS = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/";
const cfg = window.APP_CONFIG;
const app = document.getElementById("app");
const modal = document.getElementById("modal");
const DEMO = new URLSearchParams(location.search).has("demo");

// ───────────────────────── helpers ─────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cc = (c) => c?.text || c?.coding?.find((x) => x.display)?.display || c?.coding?.[0]?.code || "";
const fmtNum = (n) => (typeof n === "number" ? +n.toFixed(2) : n);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const ago = (d) => {
  if (!d) return "";
  const days = Math.round((Date.now() - new Date(d)) / 864e5);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
};
const age = (dob) => (dob ? Math.floor((Date.now() - new Date(dob)) / 31557600000) : null);
const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const topbar = (right = "") => `
  <header class="topbar">
    <div class="logo"><div class="logo-mark">♥</div>CareSummary</div>
    <div>${right}</div>
  </header>`;

function loading(msg) {
  app.innerHTML = topbar() + `<div class="center"><div><div class="spinner"></div><p class="muted">${esc(msg)}</p></div></div>`;
}
function fail(msg) {
  app.innerHTML = topbar(`<button class="btn" onclick="restart()">Start over</button>`) +
    `<div class="center"><div style="max-width:560px"><div style="font-size:40px">⚠️</div><h2>Something went wrong</h2><p class="error">${esc(msg)}</p>
     <button class="btn btn-primary" onclick="restart()">Back to sign-in</button></div></div>`;
}
window.restart = () => { sessionStorage.clear(); location.href = location.pathname; };

// ───────────────────────── SMART auth ─────────────────────────
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (n = 64) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = (s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));

// fetch that gives up after `ms` instead of hanging on a slow/unreachable server
async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? `${new URL(url).host} didn't respond within ${ms / 1000}s. The health system's server may be down or slow — try again later.` : `Couldn't reach ${new URL(url).host} (${e.message}).`); }
  finally { clearTimeout(t); }
}

async function discover(iss) {
  try {
    const r = await fetchWithTimeout(iss + ".well-known/smart-configuration", { headers: { Accept: "application/json" } });
    if (r.ok) {
      const j = await r.json();
      if (j.authorization_endpoint && j.token_endpoint) return j;
    }
  } catch {}
  const r = await fetchWithTimeout(iss + "metadata", { headers: { Accept: "application/fhir+json" } });
  const meta = await r.json();
  const ext = meta.rest?.[0]?.security?.extension?.find((e) => e.url.includes("oauth-uris"))?.extension || [];
  const get = (n) => ext.find((e) => e.url === n)?.valueUri;
  return { authorization_endpoint: get("authorize"), token_endpoint: get("token") };
}

async function authorize(iss, orgName, launch) {
  const isSandbox = iss === SANDBOX_ISS;
  const clientId = isSandbox ? cfg.nonProdClientId : cfg.prodClientId;
  if (!clientId || clientId.startsWith("PASTE_")) throw new Error(`Set ${isSandbox ? "nonProdClientId" : "prodClientId"} in app/config.js first.`);
  loading(`Connecting to ${orgName || iss} …`);
  const smart = await discover(iss);
  if (!smart.authorization_endpoint) throw new Error("Couldn't find the sign-in address for " + iss);
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem("smart_auth", JSON.stringify({ iss, orgName, clientId, verifier, state, tokenUrl: smart.token_endpoint }));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: cfg.redirectUri,
    scope: launch ? cfg.scope.replace("launch/patient", "launch") : cfg.scope,
    state,
    aud: iss,
    code_challenge: b64url(await sha256(verifier)),
    code_challenge_method: "S256",
  });
  if (launch) params.set("launch", launch);
  location.href = smart.authorization_endpoint + "?" + params;
}

async function handleCallback(params) {
  const saved = JSON.parse(sessionStorage.getItem("smart_auth") || "null");
  if (!saved || params.get("state") !== saved.state) throw new Error("Sign-in state didn't match. Please start again.");
  loading("Signing you in …");
  const r = await fetchWithTimeout(saved.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.get("code"),
      redirect_uri: cfg.redirectUri,
      client_id: saved.clientId,
      code_verifier: saved.verifier,
    }),
  });
  const token = await r.json();
  if (!r.ok) throw new Error("Token request failed: " + JSON.stringify(token));
  const session = { ...token, iss: saved.iss, orgName: saved.orgName, obtained: Date.now() };
  sessionStorage.setItem("smart_token", JSON.stringify(session));
  sessionStorage.removeItem("smart_auth");
  history.replaceState(null, "", location.pathname);
  return session;
}

// ───────────────────────── FHIR access ─────────────────────────
let TOKEN = null;
async function api(path) {
  if (DEMO) return window.DEMO_FHIR(path);
  const url = /^https?:/.test(path) ? path : TOKEN.iss + path;
  const r = await fetch(url, { headers: { Authorization: "Bearer " + TOKEN.access_token, Accept: "application/fhir+json" } });
  if (r.status === 401) throw new Error("Your session expired — please sign in again.");
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path.split("?")[0]}`);
  return r.json();
}
// Search and follow "next" links (up to a few pages)
async function search(path, maxPages = 5) {
  const out = [];
  let b = await api(path);
  for (let i = 0; b && i < maxPages; i++) {
    out.push(...(b.entry || []).map((e) => e.resource).filter((r) => r && r.resourceType !== "OperationOutcome"));
    const next = b.link?.find((l) => l.relation === "next")?.url;
    b = next ? await api(next) : null;
  }
  return out;
}

// ───────────────────────── data shaping ─────────────────────────
const when = (o) => o.effectiveDateTime || o.effectivePeriod?.start || o.issued || "";

function obsValue(o) {
  const comp = (code) => o.component?.find((c) => c.code?.coding?.some((x) => x.code === code))?.valueQuantity?.value;
  const sys = comp("8480-6"), dia = comp("8462-4");
  if (sys != null && dia != null) return { num: sys, display: `${fmtNum(sys)}/${fmtNum(dia)}`, unit: "mmHg" };
  if (o.valueQuantity) return { num: o.valueQuantity.value, display: fmtNum(o.valueQuantity.value), unit: o.valueQuantity.unit || o.valueQuantity.code || "" };
  if (o.valueString) return { display: o.valueString, unit: "" };
  if (o.valueCodeableConcept) return { display: cc(o.valueCodeableConcept), unit: "" };
  if (o.component?.length) return { display: o.component.map((c) => `${fmtNum(c.valueQuantity?.value)}`).join(" / "), unit: o.component[0].valueQuantity?.unit || "" };
  return { display: o.dataAbsentReason ? cc(o.dataAbsentReason) : "—", unit: "" };
}

function refRange(o) {
  const r = o.referenceRange?.[0];
  if (!r) return "";
  if (r.text) return r.text;
  const lo = r.low?.value, hi = r.high?.value;
  if (lo != null && hi != null) return `${fmtNum(lo)}–${fmtNum(hi)}`;
  if (lo != null) return `≥ ${fmtNum(lo)}`;
  if (hi != null) return `≤ ${fmtNum(hi)}`;
  return "";
}

function flagOf(o) {
  const code = (o.interpretation?.[0]?.coding?.[0]?.code || "").toUpperCase();
  if (["H", "HH", "HU", ">"].includes(code)) return "H";
  if (["L", "LL", "LU", "<"].includes(code)) return "L";
  if (["A", "AA"].includes(code)) return "H";
  const v = o.valueQuantity?.value, r = o.referenceRange?.[0];
  if (v != null && r) {
    if (r.high?.value != null && v > r.high.value) return "H";
    if (r.low?.value != null && v < r.low.value) return "L";
    return "N";
  }
  return code === "N" ? "N" : "";
}

// Group observations by test name → newest first
function groupObs(list) {
  const map = new Map();
  for (const o of list) {
    const name = cc(o.code) || "Unnamed";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(o);
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, items: items.sort((a, b) => when(b).localeCompare(when(a))) }))
    .sort((a, b) => when(b.items[0]).localeCompare(when(a.items[0])));
}

const VITAL_STYLE = [
  [/blood pressure|bp\b/i, "🩸", "#e5484d"],
  [/pulse|heart rate/i, "❤️", "#f43f5e"],
  [/temp/i, "🌡️", "#f59e0b"],
  [/resp/i, "🌬️", "#0ea5e9"],
  [/spo2|oxygen|o2 sat/i, "🫁", "#06b6d4"],
  [/bmi|body mass/i, "📊", "#8b5cf6"],
  [/weight/i, "⚖️", "#6366f1"],
  [/height|length/i, "📏", "#14b8a6"],
  [/pain/i, "🩹", "#f97316"],
];
const vitalStyle = (name) => VITAL_STYLE.find(([re]) => re.test(name)) || [null, "🩺", "#5b5bf6"];

function sparkline(items, color) {
  const pts = items.map((o) => obsValue(o).num).filter((n) => typeof n === "number").reverse().slice(-12);
  if (pts.length < 2) return "";
  const w = 110, h = 34, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${d} L${w},${h} L0,${h} Z" fill="${color}" opacity=".12"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="3" fill="${color}"/></svg>`;
}

function medName(m) {
  return cc(m.medicationCodeableConcept) || m.medicationReference?.display || "Unnamed medication";
}
function medSig(m) {
  const d = m.dosageInstruction?.[0];
  if (!d) return "";
  if (d.text) return d.text;
  const dose = d.doseAndRate?.[0]?.doseQuantity;
  return [dose && `${fmtNum(dose.value)} ${dose.unit || ""}`, cc(d.route), d.timing?.code && cc(d.timing.code)].filter(Boolean).join(" · ");
}

// ───────────────────────── landing / org picker ─────────────────────────
let ORGS = [];
let selected = null;

async function showLanding() {
  ORGS = await (await fetch("endpoints.json")).json();
  app.innerHTML = topbar(`<a class="btn hide-sm" href="?demo" style="text-decoration:none">✨ View demo</a>`) + `
    <section class="landing">
      <div class="hero">
        <span class="pill">● SMART on FHIR · Epic</span>
        <h1>Your health record,<br/><span>beautifully clear.</span></h1>
        <p>Sign in with MyChart at your health system and see your vitals, lab results and medications in one place. Data flows straight from Epic to this browser — nothing is stored on a server.</p>
        <div class="features">
          <span class="feature">🩺 Vital signs & trends</span>
          <span class="feature">🧪 Lab results with flags</span>
          <span class="feature">💊 Medications</span>
          <span class="feature">🔒 OAuth 2.0 + PKCE</span>
        </div>
      </div>
      <div class="connect-card">
        <div class="brand-badge"><div class="logo-mark">♥</div><div><strong>CareSummary</strong><small>Secure sign-in with MyChart</small></div></div>
        <h2>Find your health system</h2>
        <p class="muted" style="margin:0 0 14px">Start typing the name of your hospital or clinic.</p>
        <div class="combo" id="combo">
          <input id="search" class="search" type="search" placeholder="e.g. Kaiser, Children's, Baptist…" autocomplete="off"
                 role="combobox" aria-expanded="false" aria-controls="orgs" />
          <div id="orgs" class="dropdown" role="listbox" hidden></div>
        </div>
        <div id="chosen"></div>
        <button id="connect" class="btn btn-primary btn-lg" disabled>Continue with MyChart →</button>
        <div class="divider">or</div>
        <button id="sandbox" class="btn btn-ghost btn-lg">🧪 Try with Epic test patients</button>
        <p class="footnote">🔒 You sign in on your health system's own MyChart page. CareSummary never sees your password.</p>
      </div>
    </section>`;

  const s = document.getElementById("search");
  const dd = document.getElementById("orgs");
  let results = [], active = 0;

  const highlight = (name, q) => {
    const i = name.toLowerCase().indexOf(q);
    return i < 0 ? esc(name) : esc(name.slice(0, i)) + `<mark>${esc(name.slice(i, i + q.length))}</mark>` + esc(name.slice(i + q.length));
  };
  const renderOrgs = () => {
    const ql = s.value.toLowerCase().trim();
    results = ql.length < 2 ? [] : ORGS.filter((o) => o.name.toLowerCase().includes(ql)).slice(0, 8);
    active = 0;
    if (ql.length < 2) { dd.hidden = true; s.setAttribute("aria-expanded", "false"); return; }
    dd.innerHTML = results.length
      ? results.map((o, i) => `<div class="dd-item ${i === active ? "active" : ""}" role="option" data-i="${i}">
          <div class="ico">${esc(initials(o.name))}</div><div><strong>${highlight(o.name, ql)}</strong><small>${esc(new URL(o.iss).host)}</small></div></div>`).join("")
      : `<div class="dd-empty">No health system matches “${esc(s.value)}”</div>`;
    dd.hidden = false;
    s.setAttribute("aria-expanded", "true");
  };
  const choose = (o) => {
    selected = o;
    s.value = "";
    dd.hidden = true;
    document.getElementById("combo").hidden = true;
    document.getElementById("chosen").innerHTML = `
      <div class="chosen"><div class="ico">${esc(initials(o.name))}</div>
        <div style="flex:1;min-width:0"><span class="muted" style="font-size:12px">Signing in to</span><strong>${esc(o.name)}</strong></div>
        <button class="link" id="change">Change</button></div>`;
    document.getElementById("connect").disabled = false;
    document.getElementById("change").onclick = () => {
      selected = null;
      document.getElementById("chosen").innerHTML = "";
      document.getElementById("combo").hidden = false;
      document.getElementById("connect").disabled = true;
      s.focus();
    };
  };

  s.addEventListener("input", renderOrgs);
  s.addEventListener("keydown", (e) => {
    if (dd.hidden || !results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
      dd.querySelectorAll(".dd-item").forEach((el, i) => el.classList.toggle("active", i === active));
    } else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") dd.hidden = true;
  });
  dd.addEventListener("mousedown", (e) => {
    const it = e.target.closest(".dd-item");
    if (it) { e.preventDefault(); choose(results[+it.dataset.i]); }
  });
  s.addEventListener("blur", () => setTimeout(() => (dd.hidden = true), 100));

  if (cfg.defaultOrganization) {
    const o = ORGS.find((x) => x.name.toLowerCase().includes(cfg.defaultOrganization.toLowerCase()));
    if (o) choose(o);
  }

  const go = async (iss, name) => { try { await authorize(iss, name); } catch (e) { fail(e.message); } };
  document.getElementById("connect").onclick = () => selected && go(selected.iss, selected.name);
  document.getElementById("sandbox").onclick = () => go(SANDBOX_ISS, "Epic Sandbox");
}

// ───────────────────────── dashboard ─────────────────────────
const STATE = { tab: "overview", labQuery: "", medFilter: "active" };
let DATA = null;

async function showDashboard() {
  loading("Loading your health record …");
  const pid = TOKEN.patient;
  if (!pid) throw new Error("Epic didn't return a patient for this sign-in (no 'patient' in the token).");
  const settle = (p) => p.then((v) => ({ ok: v }), (e) => ({ err: e.message }));
  const [patient, vitals, labs, meds] = await Promise.all([
    settle(api(`Patient/${pid}`)),
    settle(search(`Observation?patient=${pid}&category=vital-signs`)),
    settle(search(`Observation?patient=${pid}&category=laboratory`)),
    settle(search(`MedicationRequest?patient=${pid}`)),
  ]);
  if (patient.err) throw new Error("Couldn't load the patient: " + patient.err);
  DATA = {
    patient: patient.ok,
    vitals: vitals.ok ? groupObs(vitals.ok) : [], vitalsErr: vitals.err,
    labs: labs.ok ? groupObs(labs.ok) : [], labsErr: labs.err,
    meds: (meds.ok || []).sort((a, b) => (b.authoredOn || "").localeCompare(a.authoredOn || "")), medsErr: meds.err,
  };
  renderDashboard();
}

function patientHero(p) {
  const n = p.name?.find((x) => x.use === "official") || p.name?.[0] || {};
  const full = n.text || [...(n.given || []), n.family].filter(Boolean).join(" ") || "Unknown patient";
  const a = p.address?.find((x) => x.use === "home") || p.address?.[0];
  const addr = a && (a.text || [...(a.line || []), a.city, a.state, a.postalCode].filter(Boolean).join(", "));
  const phone = p.telecom?.find((t) => t.system === "phone")?.value;
  const email = p.telecom?.find((t) => t.system === "email")?.value;
  const lang = cc(p.communication?.find((c) => c.preferred)?.language || p.communication?.[0]?.language);
  const mrn = p.identifier?.find((i) => /mrn|medical record/i.test(cc(i.type) + (i.type?.coding?.[0]?.code || ""))) ;
  const pcp = p.generalPractitioner?.[0]?.display;
  const yrs = age(p.birthDate);
  const facts = [
    ["Date of birth", p.birthDate && `${fmtDate(p.birthDate)}`],
    ["MRN", mrn?.value],
    ["Phone", phone], ["Email", email], ["Address", addr],
    ["Language", lang], ["Marital status", cc(p.maritalStatus)], ["Primary care", pcp],
  ].filter(([, v]) => v);
  return `
    <section class="patient-hero">
      <div class="patient-top">
        <div class="avatar">${esc(initials(full))}</div>
        <div>
          <h1>${esc(full)}</h1>
          <div class="chips">
            ${p.gender ? `<span class="chip">${esc(p.gender[0].toUpperCase() + p.gender.slice(1))}</span>` : ""}
            ${yrs != null ? `<span class="chip">${yrs} years old</span>` : ""}
            ${p.deceasedBoolean || p.deceasedDateTime ? `<span class="chip">Deceased</span>` : ""}
            <span class="chip">🏥 ${esc(TOKEN.orgName || "Epic")}</span>
          </div>
        </div>
      </div>
      <div class="facts">${facts.map(([k, v]) => `<div class="fact"><label>${k}</label><div>${esc(v)}</div></div>`).join("")}</div>
    </section>`;
}

function vitalTile(g) {
  const o = g.items[0], v = obsValue(o), [, emoji, color] = vitalStyle(g.name);
  return `<button class="vital" onclick="openObs('${esc(o.id)}')">
    <div class="top"><span class="em" style="background:${color}1f">${emoji}</span>${esc(g.name)}</div>
    <div class="val">${esc(v.display)}<small>${esc(v.unit)}</small></div>
    <div class="foot"><span>${esc(ago(when(o)))} · ${g.items.length} reading${g.items.length > 1 ? "s" : ""}</span>${sparkline(g.items, color)}</div>
  </button>`;
}

const flagBadge = (f) => (f === "H" ? `<span class="flag H">▲ High</span>` : f === "L" ? `<span class="flag L">▼ Low</span>` : f === "N" ? `<span class="flag N">Normal</span>` : "");
const errBox = (e) => (e ? `<div class="empty error">Couldn't load: ${esc(e)}</div>` : "");

function labsTable(groups) {
  if (!groups.length) return `<div class="empty">No lab results found.</div>`;
  return `<div style="overflow-x:auto"><table>
    <thead><tr><th>Test</th><th>Result</th><th>Flag</th><th class="hide-sm">Reference</th><th>Date</th><th class="hide-sm">Trend</th></tr></thead>
    <tbody>${groups.map((g) => {
      const o = g.items[0], v = obsValue(o);
      return `<tr class="click" onclick="openObs('${esc(o.id)}')">
        <td><strong>${esc(g.name)}</strong></td>
        <td><strong>${esc(v.display)}</strong> <span class="muted">${esc(v.unit)}</span></td>
        <td>${flagBadge(flagOf(o))}</td>
        <td class="muted hide-sm">${esc(refRange(o))}</td>
        <td class="muted">${esc(fmtDate(when(o)))}</td>
        <td class="hide-sm">${sparkline(g.items, "#5b5bf6")}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

const isActive = (m) => ["active", "on-hold"].includes(m.status);
function medCard(m) {
  const sig = medSig(m);
  const rows = [
    ["Prescribed", m.authoredOn && fmtDate(m.authoredOn)],
    ["Prescriber", m.requester?.display],
    ["Reason", m.reasonCode?.map(cc).filter(Boolean).join(", ")],
    ["Quantity", m.dispenseRequest?.quantity && `${fmtNum(m.dispenseRequest.quantity.value)} ${m.dispenseRequest.quantity.unit || ""}`],
    ["Refills", m.dispenseRequest?.numberOfRepeatsAllowed],
    ["Type", cc(m.courseOfTherapyType) || cc(m.category?.[0])],
  ].filter(([, v]) => v != null && v !== "");
  return `<article class="med">
    <div class="med-head"><div class="med-ico">💊</div>
      <div><h3>${esc(medName(m))}</h3><span class="status ${isActive(m) ? "active" : "other"}">${esc(m.status || "unknown")}</span></div></div>
    ${sig ? `<div class="sig">📝 ${esc(sig)}</div>` : ""}
    ${rows.length ? `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
  </article>`;
}

function renderDashboard() {
  const { patient, vitals, labs, meds } = DATA;
  const abnormal = labs.filter((g) => ["H", "L"].includes(flagOf(g.items[0])));
  const active = meds.filter(isActive);
  const tabs = [["overview", "Overview", ""], ["vitals", "Vitals", vitals.length], ["labs", "Lab results", labs.length], ["meds", "Medications", meds.length]];

  let body = "";
  if (STATE.tab === "overview") {
    body = `
      <div class="stats">
        <div class="stat"><div class="n">${vitals.length}</div><div class="l">Vital sign types</div></div>
        <div class="stat"><div class="n">${labs.length}</div><div class="l">Lab tests</div></div>
        <div class="stat"><div class="n" style="color:${abnormal.length ? "var(--danger)" : "var(--ok)"}">${abnormal.length}</div><div class="l">Out-of-range labs</div></div>
        <div class="stat"><div class="n">${active.length}</div><div class="l">Active medications</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Latest vitals</h2><button class="btn" onclick="setTab('vitals')">See all →</button></div>
        ${errBox(DATA.vitalsErr) || (vitals.length ? `<div class="vitals">${vitals.slice(0, 6).map(vitalTile).join("")}</div>` : `<div class="empty">No vitals recorded.</div>`)}</div>
      <div class="two-col" style="margin-top:20px">
        <div class="panel"><div class="panel-head"><h2>Needs attention</h2><button class="btn" onclick="setTab('labs')">All labs →</button></div>
          ${errBox(DATA.labsErr) || (abnormal.length ? `<ul class="list">${abnormal.slice(0, 8).map((g) => { const o = g.items[0], v = obsValue(o);
            return `<li class="click" style="cursor:pointer" onclick="openObs('${esc(o.id)}')"><span><strong>${esc(g.name)}</strong><br/><span class="muted" style="font-size:13px">${esc(fmtDate(when(o)))}</span></span>
            <span style="text-align:right">${esc(v.display)} <span class="muted">${esc(v.unit)}</span><br/>${flagBadge(flagOf(o))}</span></li>`; }).join("")}</ul>`
            : `<div class="empty">🎉 All recent labs are within range.</div>`)}</div>
        <div class="panel"><div class="panel-head"><h2>Active medications</h2><button class="btn" onclick="setTab('meds')">All meds →</button></div>
          ${errBox(DATA.medsErr) || (active.length ? `<ul class="list">${active.slice(0, 8).map((m) => `<li><span><strong>${esc(medName(m))}</strong><br/><span class="muted" style="font-size:13px">${esc(medSig(m) || "—")}</span></span></li>`).join("")}</ul>`
            : `<div class="empty">No active medications.</div>`)}</div>
      </div>`;
  } else if (STATE.tab === "vitals") {
    body = `<div class="panel"><div class="panel-head"><h2>Vital signs</h2><span class="muted">Tap a card for details & history</span></div>
      ${errBox(DATA.vitalsErr) || (vitals.length ? `<div class="vitals">${vitals.map(vitalTile).join("")}</div>` : `<div class="empty">No vitals recorded.</div>`)}</div>`;
  } else if (STATE.tab === "labs") {
    const q = STATE.labQuery.toLowerCase();
    body = `<div class="panel"><div class="panel-head"><h2>Lab results</h2>
      <input class="filter" id="labq" placeholder="Filter tests…" value="${esc(STATE.labQuery)}" /></div>
      ${errBox(DATA.labsErr) || labsTable(labs.filter((g) => g.name.toLowerCase().includes(q)))}</div>`;
  } else {
    const list = STATE.medFilter === "active" ? active : meds;
    body = `<div class="panel"><div class="panel-head"><h2>Medications</h2>
      <div class="seg"><button class="${STATE.medFilter === "active" ? "on" : ""}" onclick="setMed('active')">Active (${active.length})</button>
      <button class="${STATE.medFilter === "all" ? "on" : ""}" onclick="setMed('all')">All (${meds.length})</button></div></div>
      ${errBox(DATA.medsErr) || (list.length ? `<div class="meds">${list.map(medCard).join("")}</div>` : `<div class="empty">No medications to show.</div>`)}</div>`;
  }

  app.innerHTML = topbar(`<button class="btn" onclick="restart()">Sign out</button>`) + `
    <main class="wrap">
      ${patientHero(patient)}
      <nav class="tabs">${tabs.map(([k, l, c]) => `<button class="tab ${STATE.tab === k ? "active" : ""}" onclick="setTab('${k}')">${l}${c !== "" ? `<span class="count">${c}</span>` : ""}</button>`).join("")}</nav>
      ${body}
      <details class="conn"><summary>Connection details</summary>
        <pre>${esc(JSON.stringify({ server: TOKEN.iss, organization: TOKEN.orgName, patient: TOKEN.patient, scope: TOKEN.scope, expires_in: TOKEN.expires_in, token_type: TOKEN.token_type }, null, 2))}</pre>
      </details>
    </main>`;

  const lq = document.getElementById("labq");
  if (lq) {
    lq.oninput = () => { STATE.labQuery = lq.value; renderDashboard(); const n = document.getElementById("labq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  }
}
window.setTab = (t) => { STATE.tab = t; renderDashboard(); window.scrollTo({ top: 0, behavior: "smooth" }); };
window.setMed = (f) => { STATE.medFilter = f; renderDashboard(); };

// Observation detail — uses Observation.Read for the fresh record
window.openObs = async (id) => {
  modal.hidden = false;
  modal.innerHTML = `<div class="sheet"><div class="spinner"></div></div>`;
  try {
    const o = await api(`Observation/${id}`);
    const name = cc(o.code);
    const group = [...DATA.vitals, ...DATA.labs].find((g) => g.name === name);
    const v = obsValue(o), f = flagOf(o);
    const rows = [
      ["Date", fmtDate(when(o))], ["Status", o.status], ["Category", o.category?.map(cc).filter(Boolean).join(", ")],
      ["Reference range", refRange(o)], ["Performer", o.performer?.map((p) => p.display).filter(Boolean).join(", ")],
      ["Specimen", o.specimen?.display], ["Note", o.note?.map((n) => n.text).join(" ")],
      ["LOINC", o.code?.coding?.find((c) => /loinc/.test(c.system || ""))?.code],
    ].filter(([, x]) => x);
    modal.innerHTML = `<div class="sheet" role="dialog">
      <div class="sheet-head"><div><span class="muted" style="font-size:13px">Observation</span><h2>${esc(name)}</h2></div>
        <button class="close" onclick="closeModal()" aria-label="Close">×</button></div>
      <div class="big">${esc(v.display)} <span class="muted" style="font-size:18px">${esc(v.unit)}</span> ${flagBadge(f)}</div>
      <dl class="kv">${rows.map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join("")}</dl>
      ${group && group.items.length > 1 ? `<div class="history"><h3 style="font-size:15px">History</h3><ul class="list">${group.items.slice(0, 15).map((h) => {
        const hv = obsValue(h); return `<li><span class="muted">${esc(fmtDate(when(h)))}</span><span><strong>${esc(hv.display)}</strong> ${esc(hv.unit)} ${flagBadge(flagOf(h))}</span></li>`; }).join("")}</ul></div>` : ""}
      <details style="margin-top:16px"><summary class="muted">Raw FHIR resource</summary><pre>${esc(JSON.stringify(o, null, 2))}</pre></details>
    </div>`;
  } catch (e) {
    modal.innerHTML = `<div class="sheet"><div class="sheet-head"><h2>Couldn't load</h2><button class="close" onclick="closeModal()">×</button></div><p class="error">${esc(e.message)}</p></div>`;
  }
};
window.closeModal = () => { modal.hidden = true; modal.innerHTML = ""; };
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ───────────────────────── entry point ─────────────────────────
(async () => {
  const params = new URLSearchParams(location.search);
  try {
    if (DEMO) {
      TOKEN = { iss: "demo://", orgName: "Demo Health (sample data)", patient: "demo", scope: cfg.scope, token_type: "Bearer", expires_in: 3600 };
      return await showDashboard();
    }
    if (params.get("error")) throw new Error(`${params.get("error")}: ${params.get("error_description") || "sign-in was cancelled or rejected."}`);
    if (params.get("code")) { TOKEN = await handleCallback(params); return await showDashboard(); }
    if (params.get("iss") && params.get("launch")) return await authorize(params.get("iss").replace(/\/?$/, "/"), "", params.get("launch"));
    const saved = sessionStorage.getItem("smart_token");
    if (saved) { TOKEN = JSON.parse(saved); return await showDashboard(); }
    await showLanding();
  } catch (e) {
    fail(e.message);
  }
})();
