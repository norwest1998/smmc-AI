/**
 * Auto-process pending Average Score Requests.
 * Bind to the AVGRequests spreadsheet (Extensions > Apps Script).
 * Run setupTemplates() once, then installTrigger() once.
 */
const CFG = {
  REQ_SHEET: "AvgScrReq",
  TEMPLATE_SS_ID: "1M0_jDbN35e6eX96SNylY-J887Ks48Y9dNudOYMgKkjE",
  RESULTS_URL: "https://radiosailing.org.au/results/{id}", // {id} = ConfRegID
  APPROVED_ID: "TMASRA001",
  DECLINED_ID: "TMASRD001",
  SIGNATURE_ID: "TMUQJWSNDGMAC" // Race Secretary
};

/* ───────── Main ───────── */
function processPendingAvgRequests() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.REQ_SHEET);
  const data = sh.getDataRange().getValues();
  const H = {};
  data[0].forEach((h, i) => H[String(h).trim()] = i);
  const rows = data.slice(1)
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(x => String(x.r[H["Status"]]).trim().toLowerCase() === "pending");
  if (!rows.length) return;

  const cache = {};
  const set = (row, col, v) => sh.getRange(row, H[col] + 1).setValue(v);

  rows.forEach(({ r, row }) => {
    const id = String(r[H["ConfRegID"]]).trim();
    if (!id) return Logger.log(`${r[H["Request ID"]]}: no ConfRegID, skipped`);

    if (!(id in cache)) cache[id] = fetchResults_(id);
    const results = cache[id];
    if (!results) return Logger.log(`${r[H["Request ID"]]}: results not available yet`);

    const name = String(r[H["Member Name"]]).trim();
    const approved = nameInResults_(name, results);
    const d = r[H["Date"]];
    const vars = {
      member: name,
      eventDate: d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy") : d,
      missedEvent: String(r[H["Event Name"]]).trim() || `${r[H["Class"]]} ${r[H["Regatta Type"]]}`,
      attendedEvent: r[H["Conflicting Regatta"]],
      class: r[H["Class"]]
    };

    sendTemplate_(approved ? CFG.APPROVED_ID : CFG.DECLINED_ID, r[H["Member Email"]], vars);

    set(row, "Status", approved ? "Approved" : "Rejected");
    if (!approved) set(row, "Rejected Reason", "Not listed in published results for " + vars.attendedEvent);
    set(row, "Decision By", "Auto");
    set(row, "Decision Date", new Date());
    set(row, "Email Sent", new Date());
  });
}

/* ───────── Results ───────── */
function fetchResults_(id) {
  const res = UrlFetchApp.fetch(CFG.RESULTS_URL.replace("{id}", id), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const text = norm_(res.getContentText()
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;/g, " "));
  return text.length > 200 ? text : null; // crude "results published" check - tune to ARYA page
}

function norm_(s) { return String(s).toLowerCase().replace(/[^a-z0-9, ]+/g, " ").replace(/\s+/g, " ").trim(); }

function nameInResults_(name, text) {
  const p = norm_(name).split(" ");
  const first = p[0], last = p[p.length - 1];
  return [`${first} ${last}`, `${last} ${first}`, `${last}, ${first}`].some(n => text.includes(n));
}

/* ───────── Email ───────── */
function sendTemplate_(templateId, to, vars) {
  const ss = SpreadsheetApp.openById(CFG.TEMPLATE_SS_ID);
  const t = findRow_(ss.getSheetByName("EmailTemplates"), "TemplateID", templateId);
  if (!t) throw new Error("Template not found: " + templateId);
  const sig = findRow_(ss.getSheetByName("Signatures"), "SignatureID", t.Signature || CFG.SIGNATURE_ID);
  const fill = s => String(s).replace(/#\{(\w+)\}/g, (m, k) => vars[k] ?? m);

  MailApp.sendEmail({
    to,
    cc: t.DefaultCC || "",
    bcc: t.DefaultBCC || "",
    subject: `${String(t.SubjectPrefix).trim()} ${fill(t.DefaultSubject)}`.trim(),
    htmlBody: fill(t.Body) + (sig ? sig.Body : "")
  });
}

function findRow_(sheet, keyCol, key) {
  const v = sheet.getDataRange().getValues();
  const h = v[0];
  const k = h.indexOf(keyCol);
  const r = v.slice(1).find(x => String(x[k]).trim() === key);
  if (!r) return null;
  const o = {};
  h.forEach((c, i) => o[c] = r[i]);
  return o;
}

/* ───────── One-time setup ───────── */
function setupTemplates() {
  const sheet = SpreadsheetApp.openById(CFG.TEMPLATE_SS_ID).getSheetByName("EmailTemplates");
  const now = new Date().toISOString();
  const common = { RecipientType: "single", Visibility: "private", Topic: "results", SubjectPrefix: "FYI",
    DefaultSubject: "Average Score Request - #{missedEvent}", DefaultCC: "norwest1998@gmail.com",
    ScheduledSend: "now", Signature: CFG.SIGNATURE_ID, UpdatedAt: now };

  upsert_(sheet, Object.assign({}, common, {
    TemplateID: CFG.APPROVED_ID, Name: "Average Score Request Approved",
    Body: "<p>Hi #{member},</p><p><br></p><p>Your average score request has been <b>approved</b>.</p><p><br></p>" +
      "<p>Missed event: <b>#{missedEvent}</b> on <b>#{eventDate}</b></p><p>Event attended: <b>#{attendedEvent}</b></p><p><br></p>" +
      "<p>We confirmed your entry in the published results. Your average score will be applied.</p><p><br></p><p>Regards,</p><p>SMMC Auto Bot</p>"
  }));
  upsert_(sheet, Object.assign({}, common, {
    TemplateID: CFG.DECLINED_ID, Name: "Average Score Request Declined",
    Body: "<p>Hi #{member},</p><p><br></p><p>Your average score request has been <b>declined</b>.</p><p><br></p>" +
      "<p>Missed event: <b>#{missedEvent}</b> on <b>#{eventDate}</b></p><p>Event claimed: <b>#{attendedEvent}</b></p><p><br></p>" +
      "<p>We could not find you in the published results for that event. If you believe this is an error, please reply with details.</p><p><br></p><p>Regards,</p><p>SMMC Auto Bot</p>"
  }));
}

function upsert_(sheet, obj) {
  const v = sheet.getDataRange().getValues();
  const h = v[0];
  const idx = v.findIndex((r, i) => i > 0 && r[0] === obj.TemplateID);
  const old = idx > 0 ? v[idx] : [];
  const row = h.map((c, i) => obj[c] !== undefined ? obj[c] : (old[i] ?? (c === "CreatedAt" ? obj.UpdatedAt : "")));
  if (idx > 0) sheet.getRange(idx + 1, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function installTrigger() {
  ScriptApp.newTrigger("processPendingAvgRequests").timeBased().everyHours(6).create();
}