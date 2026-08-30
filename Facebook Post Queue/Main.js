function processNextFacebookPost() {
  const sheet = SpreadsheetApp.getActive()
    .getSheetByName('Queue');

  const rows = sheet.getDataRange().getValues();

  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] !== 'PENDING') continue;

    // Mark processing
    sheet.getRange(r + 1, 1).setValue('PROCESSING');
    sheet.getRange(r + 1, 10).setValue(new Date());

    try {
      processFacebookQueueRow(rows[r], r + 1, sheet);
    } catch (e) {
      sheet.getRange(r + 1, 1).setValue('FAILED');
      sheet.getRange(r + 1, 13).setValue(e.message);
    }
    return; // one per run
  }
}

function processFacebookQueueRow(row, rowIndex, queueSheet) {
  const [
    status,
    spreadsheetId,
    roundSheetId,
    spreadsheetName,
    sheetName,
    regattaName,
    raceDate,
    raceReport
  ] = row;


  const pngBlob = renderRoundSheetToPNG(spreadsheetId, roundSheetId);

  const displayDate = Utilities.formatDate(raceDate, Session.getScriptTimeZone(), 'dd/MM/yyyy')
  const caption =
    `${regattaName}\n${displayDate}\n\n${raceReport || ''}`;

  const postId = postPNGToFacebook(pngBlob, caption);

  queueSheet.getRange(rowIndex, 1).setValue('POSTED');
  queueSheet.getRange(rowIndex, 11).setValue(postId);
  queueSheet.getRange(rowIndex, 12).setValue(displayDate);

}

