function enqueueFacebookFromSidebar(sheetName, regattaName, raceDate, raceReport) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const sheetId = ss.getId(); // the spreadsheet ID (round sheet is in the same file)
  
  enqueueFacebookTestRow({
    sheetId: sheetId,
    regattaName: regattaName,
    raceDate: raceDate,
    raceReport: raceReport
  });
}
