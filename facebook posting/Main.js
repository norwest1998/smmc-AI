/* Main.js */

function processNextFacebookPost() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.fbPostingSheetID);
  const sheet = ss.getSheetByName('Queue');
  const rows = sheet.getDataRange().getValues();

  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] !== 'PENDING') continue;

    // Mark processing
    sheet.getRange(r + 1, 1).setValue('PROCESSING');
    sheet.getRange(r + 1, 16).setValue(new Date()); // Started

    try {
      processFacebookQueueRow(rows[r], r + 1, sheet);
    } catch (e) {
      sheet.getRange(r + 1, 1).setValue('FAILED');
      sheet.getRange(r + 1, 19).setValue(e.message); // Error
    }
    return; // one per run
  }
}

function processFacebookQueueRow(row, rowIndex, queueSheet) {
  const status = row[0];
  const postType = row[1] || 'RESULTS';
  const calendarHexKey = row[2];
  const spreadsheetID = row[3];
  const roundSheetId = row[4];
  const spreadsheetName = row[5];
  const sheetName = row[6];
  const regattaName = row[7];
  const raceDate = row[8];
  const bgImageId = row[9];
  const weatherSnippet = row[10];
  const tagline = row[11];
  const raceReport = row[12];

  let pngBlob;
  let caption = raceReport;

  if (postType === 'EVENT_NOTICE') {
    // Generate notice graphic using the selected background and overlay
    pngBlob = renderEventNoticePNG(regattaName, raceDate, weatherSnippet, tagline, bgImageId);
    if (!caption) {
      caption = `Upcoming Event: ${regattaName} on ${raceDate}`;
    }
  } else {
    // Default: Existing race results processor
    pngBlob = renderRoundSheetToPNG(spreadsheetID, roundSheetId);
    if (!caption) {
      caption = `${regattaName}\n results from races held on ${raceDate}`;
    }
  }

  // Upload to Facebook Graph API
  const postId = postPNGToFacebook(pngBlob, caption);

  // Mark completion in Queue sheet
  queueSheet.getRange(rowIndex, 1).setValue('POSTED');
  queueSheet.getRange(rowIndex, 17).setValue(postId);
  queueSheet.getRange(rowIndex, 18).setValue(new Date()); // Completed

  if (postType !== 'EVENT_NOTICE' && spreadsheetID) {
    annotateRoundSheet(spreadsheetID, postId);
  }
}
