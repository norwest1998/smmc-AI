function processNextFacebookPost() {
   const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.fbPostingSheetID);
  const sheet = ss.getSheetByName('Queue');


  const rows = sheet.getDataRange().getValues();

  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] !== 'PENDING') continue;

    // Mark processing
    sheet.getRange(r + 1, 1).setValue('PROCESSING');
    sheet.getRange(r + 1, 7).setValue(new Date());

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
    spreadsheetID,
    roundSheetId,
    spreadsheetName,
    sheetName,
    regattaName,
    raceDate,
    raceReport
  ] = row;

  const pngBlob = renderRoundSheetToPNG(spreadsheetID,roundSheetId);

  let caption = raceReport;
  if (!caption) {
     caption = `${regattaName}\n results from races held on ${raceDate}`;
  }

  const postId = postPNGToFacebook(pngBlob, caption);

  queueSheet.getRange(rowIndex, 1).setValue('POSTED');
  queueSheet.getRange(rowIndex, 11).setValue(postId);
  queueSheet.getRange(rowIndex, 9).setValue(new Date());

  annotateRoundSheet(spreadsheetID, postId);
}

function annotateRoundSheet(spreadsheetID, postId) {
  const file = DriveApp.getFileById(spreadsheetID);
  const currentDesc = file.getDescription(); 
  const description = currentDesc + `\nFacebook posted\nPost ID: ${postId}\n${new Date().toISOString()}`;
  
  file.setDescription(description);
}

