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
  const sheetName = "Email Tracking";
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

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || "list";

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
    const action = payload.action || "recordSend";

    switch (action) {
      case "recordSend":
        return json({
          success: true,
          batchKey: recordEmailSend(payload)
        });
      case "markUpdated":
        return json({
          success: markEmailUpdated(payload.key, payload.status, payload.comments)
        });
      case "markOpened":
        return json({
          success: markEmailOpened(payload.key, payload.openedAt)
        });
      case "markReminderSent":
        return json({
          success: markReminderSent(payload.key)
        });
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
