/* Main.js */

function processNextFacebookPost() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.fbPostingSheetID);
  const sheet = ss.getSheetByName('Queue');
  const rows = sheet.getDataRange().getValues();

  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] !== 'PENDING') continue;

    // Mark processing
    // Col 1 = Status, Col 15 = Started
    sheet.getRange(r + 1, 1).setValue('PROCESSING');
    sheet.getRange(r + 1, 15).setValue(new Date());

    try {
      processFacebookQueueRow(rows[r], r + 1, sheet);
    } catch (e) {
      // Col 1 = Status, Col 18 = Error
      sheet.getRange(r + 1, 1).setValue('FAILED');
      sheet.getRange(r + 1, 18).setValue(e.message);
    }
    return; // process one per run
  }
}

function processFacebookQueueRow(row, rowIndex, queueSheet) {
  const [
    status,           // 0  (Col 1)
    postTypeRaw,      // 1  (Col 2)
    calendarHexKey,   // 2  (Col 3)
    spreadsheetID,    // 3  (Col 4)
    roundSheetId,     // 4  (Col 5)
    spreadsheetName,  // 5  (Col 6)
    sheetName,        // 6  (Col 7)
    regattaName,      // 7  (Col 8)
    raceDate,         // 8  (Col 9)
    bgImageId,        // 9  (Col 10)
    weatherSnippet,   // 10 (Col 11)
    tagline,          // 11 (Col 12)
    raceReport        // 12 (Col 13)
  ] = row;

  const postType = postTypeRaw || 'RESULTS';
  let pngBlob;
  let caption = raceReport;

  if (postType === 'EVENT_NOTICE') {
    // Generate notice graphic using Google Slides compositor
    pngBlob = renderEventNoticePNG(regattaName, raceDate, weatherSnippet, tagline, bgImageId);
    if (!caption) {
      caption = `Upcoming Event: ${regattaName} on ${raceDate}`;
    }
  } else {
    // Standard race results processor
    pngBlob = renderRoundSheetToPNG(spreadsheetID, roundSheetId);
    if (!caption) {
      caption = `${regattaName}\n results from races held on ${raceDate}`;
    }
  }

  // Upload to Facebook Graph API
  const postId = postPNGToFacebook(pngBlob, caption);

  // Mark completion: Col 1 = POSTED, Col 16 = PostID, Col 17 = Completed
  queueSheet.getRange(rowIndex, 1).setValue('POSTED');
  queueSheet.getRange(rowIndex, 16).setValue(postId);
  queueSheet.getRange(rowIndex, 17).setValue(new Date());

  if (postType !== 'EVENT_NOTICE' && spreadsheetID) {
    annotateRoundSheet(spreadsheetID, postId);
  }
}