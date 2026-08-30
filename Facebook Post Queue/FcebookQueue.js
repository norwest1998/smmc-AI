/**
 * Show the Facebook posting sidebar
 */
function showFacebookPostSidebar() {
const sheetList = getRoundSheetsFromFolder(getConfig().roundResultsFolderId);
console.log(sheetList)

  const html = HtmlService.createTemplateFromFile('FacebookPostSidebar');
  html.sheetListJSON = JSON.stringify(sheetList);
  SpreadsheetApp.getUi()
    .showSidebar(html.evaluate().setTitle('Facebook Round Posting').setWidth(350));
}

function getRoundSheetsFromFolder(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  const results = [];

  while (files.hasNext()) {
    const file = files.next();
    const ss = SpreadsheetApp.openById(file.getId());

    ss.getSheets().forEach(sheet => {
      const name = sheet.getName();

      // Ignore admin sheets
      if (name === 'Config' || name === 'Validation') return;
      if (sheet.isSheetHidden && sheet.isSheetHidden()) return;
      if (sheet.isSheetHidden && sheet.isSheetHidden()) return;

      Logger.log("Race sheet: " + name);

      // Read metadata from known cells (example)
      const regattaName = sheet.getRange('C3').getDisplayValue();
      const raceDate    = sheet.getRange('C4').getDisplayValue();
      const shID = sheet.getSheetId();
      if ((!shID) || shID === 0) return;

      results.push({
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName(),
        sheetId: sheet.getSheetId(),     // ✅ FIX
        sheetName: sheet.getName(),
        regattaName,
        raceDate
      });
    });
  }
  return results;
}


function enqueueFacebookFromSidebar(index) {
  const rounds = getRoundSheetsFromFolder(getConfig().roundResultsFolderId);
  const selected = rounds[index];
  if (!selected) throw new Error('Round not found');

  enqueueFacebookTestRow({
    spreadsheetId: selected.spreadsheetId,
    sheetId: selected.sheetId,          // ✅ FIX
    spreadsheetName: selected.spreadsheetName,
    sheetName: selected.sheetName,
    regattaName: selected.regattaName,
    raceDate: selected.raceDate,
    raceReport
  });
}


/**
 * Append row to the Facebook Queue sheet
 */
function enqueueFacebookTestRow(data) {
  const ss = SpreadsheetApp.openById(getConfig().facebookQueueSheetId);
  const sheet = ss.getSheetByName('Queue');

  sheet.appendRow([
    'PENDING',
    data.spreadsheetId,     // File
    data.sheetId,           // ✅ Round sheet (FIX)
    data.spreadsheetName,
    data.sheetName,
    data.regattaName,
    data.raceDate,
    data.raceReport,
    new Date(),
    '',
    '',
    '',
    ''
  ]);
}