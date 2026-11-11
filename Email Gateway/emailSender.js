function dataGw_(op, sheet, fields) {              // all saves go through the Data Gateway
  const p = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(p.getProperty("DATA_GATEWAY_URL"), {
    method: "post", contentType: "text/plain;charset=utf-8", muteHttpExceptions: true,
    payload: JSON.stringify(Object.assign({ action: "svc", key: p.getProperty("INTERNAL_KEY"), op, domain: "tracking", sheet }, fields))
  });
  const d = JSON.parse(res.getContentText());
  if (d.error) throw new Error(d.error);
  return d;
}

function needEditor_(tok) {
  if (!tok || tok.mc || !["editor", "admin"].includes(tok.role)) throw new Error("Forbidden");
}

// the single send path: page, scheduled trigger and LateResults all use this
function deliver_(job) {
  const props = PropertiesService.getScriptProperties();
  const sender = props.getProperty("SENDER_NAME") || "SMMC", webApp = props.getProperty("WEBAPP_URL");
  return (job.recipients || []).filter(r => r.email).map((r, i) => {
    const key = r.key || job.batchKey + "-" + Utilities.getUuid().slice(0, 8);
    let html = r.resolvedBody || job.body || "";
    if (webApp) html += '<img src="' + webApp + "?key=" + encodeURIComponent(key) + "&t=" + Date.now() + '" width="1" height="1" style="display:none" alt="">';
    const opts = { htmlBody: html, name: sender };
    if (i === 0) { if (job.cc) opts.cc = job.cc; if (job.bcc) opts.bcc = job.bcc; }   // CC/BCC once per send
    try {
      GmailApp.sendEmail(r.email, job.subject, html.replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, ""), opts);
      let threadId = "";
      try { const t = GmailApp.search('to:"' + r.email + '" subject:"' + String(job.subject).replace(/"/g, '\\"') + '" newer_than:1d', 0, 1); if (t.length) threadId = t[0].getId(); } catch (e) {}
      return { email: r.email, name: r.name, key, ok: true, threadId };
    } catch (e) { return { email: r.email, name: r.name, key, ok: false, error: e.message }; }
  });
}

function sendNow_(p, tok) {                         // sends only; the page saves the rows
  needEditor_(tok);
  return { success: true, results: deliver_({ batchKey: p.batchKey, subject: p.subject, cc: p.cc, bcc: p.bcc, recipients: p.recipients }) };
}

function refreshDashboard_(p, tok) {
  needEditor_(tok);
  upsertDashboardRow_(p.batchKey, p.title || p.batchKey, new Date());
  refreshDashboardStats_(p.batchKey);
  return { success: true };
}

function fetchEmail_(sheet, tok) {                  // fresh reads, no cache
  if (!tok || tok.mc) throw new Error("Unauthorized");
  if (!["Tracking", "Dashboard", "Drafts", "Sent"].includes(sheet)) throw new Error("Forbidden");
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheet);
  return sh ? sheetToObjects_(sh).map(r => { delete r._rowIndex; return r; }) : [];
}
