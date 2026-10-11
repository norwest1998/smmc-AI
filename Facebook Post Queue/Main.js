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

  // --- FACEBOOK MAINTENANCE FUNCTIONS ---

  /**
   * Run this function ONCE from the Apps Script editor to initialize the automated tasks.
   */
  function setupFacebookQueueTrigger() {
    // 1. Delete any existing triggers to avoid duplicates running over each other
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processNextFacebookPost') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    
    // 2. Create a new trigger to run every 5 minutes
    ScriptApp.newTrigger('processNextFacebookPost')
            .timeBased()
            .everyMinutes(5) // Adjust to 10 or 15 if you want to conserve quota
            .create();
            
    Logger.log("Facebook Queue Trigger setup successfully.");
  }

  function setupFacebookTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      const name = triggers[i].getHandlerFunction();
      if (['processNextFacebookPost', 'checkFacebookTokenHealth', 'archiveOldFacebookPosts'].includes(name)) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    
    // 1. Process Queue: Runs every 5 minutes
    ScriptApp.newTrigger('processNextFacebookPost').timeBased().everyMinutes(5).create();
    
    // 2. Token Health Monitor: Runs once a day at 8 AM
    ScriptApp.newTrigger('checkFacebookTokenHealth').timeBased().everyDays(1).atHour(8).create();
    
    // 3. Queue Archiver: Runs once a day at 2 AM
    ScriptApp.newTrigger('archiveOldFacebookPosts').timeBased().everyDays(1).atHour(2).create();
    
    Logger.log("Facebook triggers setup successfully.");
  }

  /**
   * Pings Facebook Graph API to ensure the token is still valid. Alerts Admin if it expires.
   */
  function checkFacebookTokenHealth() {
    const cfg = getConfig();
    if (!cfg.fbToken) return;
    
    const url = `https://graph.facebook.com/me?access_token=${cfg.fbToken}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const result = JSON.parse(response.getContentText());
    
    if (result.error) {
      const adminEmail = Session.getActiveUser().getEmail(); // Or replace with a specific admin email
      MailApp.sendEmail(
        adminEmail, 
        "ACTION REQUIRED: SMMC Facebook Token Expired", 
        `The Facebook Graph API token for SMMC has expired or is invalid.\n\nError: ${result.error.message}\n\nPlease generate a new long-lived token and update the configuration script.`
      );
    }
  }

  /**
   * Moves POSTED rows older than 30 days to a Queue_Archive sheet to keep the portal fast.
   */
  function archiveOldFacebookPosts() {
    const ss = SpreadsheetApp.getActive();
    const queueSheet = ss.getSheetByName('Queue');
    if (!queueSheet) return;
    
    let archiveSheet = ss.getSheetByName('Queue_Archive');
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet('Queue_Archive');
      // Copy headers to the new archive sheet
      const headers = queueSheet.getRange(1, 1, 1, queueSheet.getLastColumn()).getValues();
      archiveSheet.appendRow(headers[0]);
    }
    
    const data = queueSheet.getDataRange().getValues();
    const headers = data[0];
    const statusIdx = headers.indexOf('Status');
    const completedIdx = headers.indexOf('Completed');
    if (statusIdx === -1 || completedIdx === -1) return;
    
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    // Loop backwards to safely delete rows without messing up indices
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      if (row[statusIdx] === 'POSTED') {
        const completedDate = new Date(row[completedIdx]);
        if (!isNaN(completedDate.getTime()) && (now - completedDate) > thirtyDaysMs) {
          archiveSheet.appendRow(row);
          queueSheet.deleteRow(i + 1);
        }
      }
    }
  }