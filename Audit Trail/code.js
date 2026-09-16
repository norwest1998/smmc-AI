function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter.action;
  const sheetName = e.parameter.sheet;

  if (action === "fetch") {
    const fetchSheet = ss.getSheetByName(sheetName);
    if (!fetchSheet) return json({ error: `Sheet not found: ${sheetName}` });
    const values = fetchSheet.getDataRange().getValues();
    return json({ values });
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.sheet);

  if (body.action === "update") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const hexCol = headers.indexOf("HexKey") + 1;
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(r => r[hexCol - 1] === body.hexKey);
    if (rowIndex === -1) return json({ error: "HexKey not found" }, 404);

    Object.entries(body.updates).forEach(([field, value]) => {
      const col = headers.indexOf(field) + 1;
      if (col > 0) sheet.getRange(rowIndex + 1, col).setValue(value);
    });
    return json({ success: true });
  }

  if (body.action === "append") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(h => body.rowData[h] ?? "");
    sheet.appendRow(row);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
