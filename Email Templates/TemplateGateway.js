/**
 * SHEETS CREATED AUTOMATICALLY on first access:
 *  - EmailTemplates
 *  - Signatures
 *
 * This gateway intentionally has NO SchemaRegistry integration
 */

const SS_ID = "1M0_jDbN35e6eX96SNylY-J887Ks48Y9dNudOYMgKkjE";

const SHEET_SCHEMAS = {
  EmailTemplates: [
    "TemplateID","Name","RecipientType","Visibility","Topic",
    "SubjectPrefix","DefaultSubject","DefaultCC","DefaultBCC",
    "GroupKey","ScheduledSend","Signature","Body","CreatedAt","UpdatedAt"
  ],
  Signatures: [
    "SignatureID","Name","Visibility","Body","CreatedAt","UpdatedAt"
  ]
};

/* ── Helpers ── */
function getSheet(name) {
  const ss    = SpreadsheetApp.openById(SS_ID);
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const hdrs = SHEET_SCHEMAS[name];
    if (hdrs) {
      sheet.getRange(1, 1, 1, hdrs.length).setValues([hdrs]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(v => v !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj;
    });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── GET: fetch sheet rows ── */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || "fetch";
  const sheet  = params.sheet  || "";

  try {
    if (action === "fetch" && SHEET_SCHEMAS[sheet]) {
      const rows = sheetToObjects(getSheet(sheet));
      return jsonOut({ values: rows });
    }
    return jsonOut({ error: `Unknown action or sheet: ${action} / ${sheet}` });
  } catch(err) {
    return jsonOut({ error: err.message || String(err) });
  }
}

/* ── POST: append / update / delete ── */
function doPost(e) {
  const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
  try {
    const payload = JSON.parse(raw);
    const { action, sheet: sheetName, key, data, id } = payload;

    if (!SHEET_SCHEMAS[sheetName]) {
      return jsonOut({ error: `Unknown sheet: ${sheetName}` });
    }
    const sheet   = getSheet(sheetName);
    const headers = SHEET_SCHEMAS[sheetName];

    switch (action) {

      case "append": {
        const row = headers.map(h => data[h] ?? "");
        sheet.appendRow(row);
        return jsonOut({ success: true, id: data[key] });
      }

      case "update": {
        const allData = sheet.getDataRange().getValues();
        const hdrs    = allData[0];
        const keyCol  = hdrs.indexOf(key);
        if (keyCol < 0) return jsonOut({ error: `Key column "${key}" not found.` });
        for (let i = 1; i < allData.length; i++) {
          if (String(allData[i][keyCol]).trim() === String(data[key]).trim()) {
            const rowValues = headers.map(h => {
              // Preserve fields not supplied in data
              const colIdx = hdrs.indexOf(h);
              return (data[h] !== undefined) ? data[h] : (colIdx >= 0 ? allData[i][colIdx] : "");
            });
            sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
            return jsonOut({ success: true });
          }
        }
        return jsonOut({ error: "Record not found for update." });
      }

      case "delete": {
        const allData = sheet.getDataRange().getValues();
        const hdrs    = allData[0];
        const keyCol  = hdrs.indexOf(key);
        if (keyCol < 0) return jsonOut({ error: `Key column "${key}" not found.` });
        for (let i = 1; i < allData.length; i++) {
          if (String(allData[i][keyCol]).trim() === String(id).trim()) {
            sheet.deleteRow(i + 1);
            return jsonOut({ success: true });
          }
        }
        return jsonOut({ error: "Record not found for deletion." });
      }

      default:
        return jsonOut({ error: `Unknown action: ${action}` });
    }
  } catch(err) {
    return jsonOut({ error: err.message || String(err) });
  }
}