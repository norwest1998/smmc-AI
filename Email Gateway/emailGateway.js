const EMAIL_TRACKING_HEADERS = [
  "Batch Key",
  "Club",
  "Contact Name",
  "Contact Role",
  "Email Status",
  "Key",
  "Date Sent",
  "Date Updated",
  "Response Days",
  "Response Time",
  "Email Response",
  "Reminder Sent",
  "Comments",
  "Thread ID",
  "Recipient Email",
  "Date Opened",
  "Open Count"
];

function getTrackingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "Tracking";
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
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
  const sh = getOrCreateSheet_(TRACKING_SHEET, EMAIL_TRACKING_HEADERS);
  const v = sh.getDataRange().getValues(), h = v[0].map(String), c = n => h.indexOf(n) + 1;
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]) === batchKeyEmail) {
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
      sheet.getRange(i + 1, 6).setValue(status || "Updated");
      sheet.getRange(i + 1, 8).setValue(updatedAt);
      if (comments) {
        sheet.getRange(i + 1, 13).setValue(comments);
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
      sheet.getRange(i + 1, 16).setValue(openedAt || new Date());
      const openCount = Number(rows[i][16]) || 0;
      sheet.getRange(i + 1, 17).setValue(openCount + 1);
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
      sheet.getRange(i + 1, 12).setValue("Yes");
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

function doPost(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  try {
    const payload = JSON.parse(raw);
    const action  = payload.action || "recordSend";
    const PUBLIC  = ["markOpened"];                       // open-tracker stays public
    const WRITERS = ["editor", "coord", "admin"];

    const tok = verifyToken(payload.token);
    if (action !== "markOpened" && !tok)
         return json({ success: false, code: "AUTH", error: "Unauthorized" });

    if (!PUBLIC.includes(action)) {
      const p = verifyToken(payload.token);
      if (!p) return json({ success: false, code: "AUTH", error: "Unauthorized" });
      if (p.mc) return json({ success: false, code: "AUTH", error: "Password change required" });
      const readOnly = ["list", "find"].includes(action);
      if (!readOnly && !WRITERS.includes(p.role))
        return json({ success: false, code: "FORBIDDEN", error: "Forbidden" });
    }

    switch (action) {
      case "fetchEmail":       return json({ success: true, values: fetchEmail_(payload.sheet, tok) });
      case "sendNow":          return json(sendNow_(payload, tok));
      case "refreshDashboard": return json(refreshDashboard_(payload, tok));

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
        needEditor_(tok);
        return json(createScheduledTrigger_(payload));
      case "cancelScheduledTrigger":
        needEditor_(tok);
        return json(cancelScheduledTrigger_(payload.draftId));
      case "sendNow":
        return json(sendNow_(payload));
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
