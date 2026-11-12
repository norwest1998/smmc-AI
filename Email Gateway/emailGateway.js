// WebApp ===========================================================

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || "list";
  
  // ---------- OPEN-TRACKING PIXEL (WEB APP) ----------
  const key = e && e.parameter && e.parameter.key;
  if (key) { 
    try { 
      recordOpen_(key); 
      } catch (err) { /* always return the pixel */ } 
    return Utilities.newBlob(
      Utilities.base64Decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'),
      'image/gif', 'pixel.gif'
    );
  }

  try {
    switch (action) {
      case "list":
        return json({ success: true, records: listTrackingRecords() });
      case "find":
        return json({ success: true, records: findTrackingRecords(params.key || params.id || "") });
      default:
        return json({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return json({ success: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  try {
    const payload = JSON.parse(raw);
    const action  = payload.action || "recordSend";
    const PUBLIC  = ["markOpened"]; // open-tracker stays public
    const WRITERS = ["editor", "coord", "admin"];

    // Validate token access for non-public actions
    const tok = verifyToken ? verifyToken(payload.token) : null;
    if (action !== "markOpened" && !tok) {
      return json({ success: false, code: "AUTH", error: "Unauthorized" });
    }

    if (!PUBLIC.includes(action) && typeof verifyToken === "function") {
      if (tok.mc) return json({ success: false, code: "AUTH", error: "Password change required" });
      const readOnly = ["list", "find"].includes(action);
      if (!readOnly && !WRITERS.includes(tok.role)) {
        return json({ success: false, code: "FORBIDDEN", error: "Forbidden" });
      }
    }

    switch (action) {
      case "fetchEmail":       
        return json({ success: true, values: typeof fetchEmail_ === "function" ? fetchEmail_(payload.sheet, tok) : [] });
      case "sendNow":          
        return json(typeof sendNow_ === "function" ? sendNow_(payload, tok) : { success: false, error: "sendNow_ not implemented" });
      case "refreshDashboard": 
        return json(typeof refreshDashboard_ === "function" ? refreshDashboard_(payload, tok) : { success: false });

      case "list":
        return json({ success: true, records: listTrackingRecords() });
      case "find":
        return json({ success: true, records: findTrackingRecords(payload.key || payload.id || "") });
      case "recordSend":
        return json({ success: true, batchKey: recordEmailSend(payload) });
      case "markUpdated":
        return json({ success: markEmailUpdated(payload.key, payload.status, payload.comments) });
      case "markOpened":
        return json({ success: markEmailOpened(payload.key, payload.openedAt) });
      case "markReminderSent":
        return json({ success: markReminderSent(payload.key) });
      case "createScheduledTrigger":
        if (typeof needEditor_ === "function") needEditor_(tok);
        return json(typeof createScheduledTrigger_ === "function" ? createScheduledTrigger_(payload) : { success: false });
      case "cancelScheduledTrigger":
        if (typeof needEditor_ === "function") needEditor_(tok);
        return json(typeof cancelScheduledTrigger_ === "function" ? cancelScheduledTrigger_(payload.draftId) : { success: false });
      default:
        return json({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return json({ success: false, error: err.message || String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getTrackingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TRACKING_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(TRACKING_SHEET);
    sheet.getRange(1, 1, 1, EMAIL_TRACKING_HEADERS.length).setValues([EMAIL_TRACKING_HEADERS]);
    sheet.setFrozenRows(1);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, EMAIL_TRACKING_HEADERS.length).setValues([EMAIL_TRACKING_HEADERS]);
  }

  return sheet;
}

function generateTrackingKey() {
  return Utilities.getUuid();
}

function markTracking_(batchKeyEmail, status, threadId) {
  const sh = getTrackingSheet();
  const v = sh.getDataRange().getValues();
  const h = v[0].map(String);
  const c = n => h.indexOf(n) + 1;
  
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === batchKeyEmail || String(v[i][5]) === batchKeyEmail) {
      sh.getRange(i + 1, c("Email Status")).setValue(status);
      if (status === "Sent") sh.getRange(i + 1, c("Date Sent")).setValue(new Date());
      if (threadId) sh.getRange(i + 1, c("Thread ID")).setValue(threadId);
      return true;
    }
  }
  return false;
}

function recordEmailSend({ batchKey, club, contactName, contactRole, recipientEmail, key }) {
  const sheet = getTrackingSheet();
  const now = new Date();
  const row = [
    batchKey || generateTrackingKey(),
    club || "",
    contactName || "",
    contactRole || "",
    "Sent",
    key || "",
    now,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    recipientEmail || "",
    "",
    0
  ];

  sheet.appendRow(row);
  return row[0];
}

function markEmailUpdated(key, status, comments) {
  const sheet = getTrackingSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][5]).trim() === String(key).trim() || String(rows[i][0]).trim() === String(key).trim()) {
      const updatedAt = new Date();
      sheet.getRange(i + 1, 5).setValue(status || "Updated"); // Column E: Email Status
      sheet.getRange(i + 1, 8).setValue(updatedAt);          // Column H: Date Updated
      if (comments) {
        sheet.getRange(i + 1, 13).setValue(comments);         // Column M: Comments
      }
      return true;
    }
  }

  return false;
}

function markEmailOpened(key, openedAt) {
  const sheet = getTrackingSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][5]).trim() === String(key).trim() || String(rows[i][0]).trim() === String(key).trim()) {
      sheet.getRange(i + 1, 16).setValue(openedAt || new Date()); // Column P: Date Opened
      const openCount = Number(rows[i][16]) || 0;
      sheet.getRange(i + 1, 17).setValue(openCount + 1);          // Column Q: Open Count
      return true;
    }
  }

  return false;
}

function markReminderSent(key) {
  const sheet = getTrackingSheet();
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][5]).trim() === String(key).trim() || String(rows[i][0]).trim() === String(key).trim()) {
      sheet.getRange(i + 1, 12).setValue("Yes"); // Column L: Reminder Sent
      return true;
    }
  }

  return false;
}

function listTrackingRecords() {
  const sheet = getTrackingSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || EMAIL_TRACKING_HEADERS;
  const rows = values.slice(1);

  return rows
    .filter(row => row.some(value => value !== ""))
    .map(row => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return record;
    });
}

function findTrackingRecords(searchKey) {
  if (!searchKey) return [];

  const sheet = getTrackingSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || EMAIL_TRACKING_HEADERS;

  return values.slice(1)
    .map((row, index) => {
      const record = {};
      headers.forEach((header, colIndex) => {
        record[header] = row[colIndex] ?? "";
      });
      return { rowIndex: index + 2, record };
    })
    .filter(({ record }) => {
      const matchesKey = String(record["Key"] || "").trim() === String(searchKey).trim();
      const matchesBatch = String(record["Batch Key"] || "").trim() === String(searchKey).trim();
      const matchesEmail = String(record["Recipient Email"] || "").trim() === String(searchKey).trim();
      return matchesKey || matchesBatch || matchesEmail;
    })
    .map(({ record }) => record);
}

