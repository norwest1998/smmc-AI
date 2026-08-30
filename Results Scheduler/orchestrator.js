function checkAndProcessJson() {
  // Clean up the trigger that just fired this function
  deleteTriggersForFunction('checkAndProcessJson');

  const file = getJsonFileFromFolder();

  if (!file) {
    Logger.log('File not found. Scheduling next trigger...');
    // Create 5-minute delay trigger
    scheduleNextEventTrigger();
    return;
  }

  const parsed = parseSimplifiedRegattaSheet(file.getId());

  Logger.log("EventID: " + parsed.eventID + " regattaName: " + parsed.regattaName)

  var raceType = 'Scratch';
  const regattaName = (parsed.regattaName || '').trim();
  const regattaType = regattaName ? regattaName.split(' ').slice(1).join(' ') : '';
  if ((regattaName === 'IOM Racing') || regattaType === 'Handicap') {
    raceType = 'Handicap';
  }

  // 1. Send data to Script A Web App
  const success = callScriptAWebApp(parsed, raceType);
  Logger.log("Success: " + success);

  if (success) {
    // 1. Move file to Archive
    archiveProcessedFile(file, CONFIG.resultsProcessedFolderId);

    // 2. Mark event as PROCESSED by matching Event ID in Column A
    if (parsed.eventID) {
      markCalendarEventProcessed(parsed.eventID);
    } else {
      Logger.log('Warning: No A1/eventId property found in JSON file.');
    }

    // 3. Schedule trigger for the NEXT unprocessed event
    scheduleNextEventTrigger();

  } else {
    Logger.log('Failed to process via Script A. Retrying in 5 minutes...');
    createDelayTrigger(5, 'checkAndProcessJson');
  }
}

function callScriptAWebApp(parsed, raceType) {
  // 1. Construct the payload object
  const payloadObject = {
    parsed: parsed,
    raceType: raceType
  };

  // 2. Stringify it for application/json content type
  const options = {
  method: "post",
  contentType: "application/json",
  headers: {"Authorization": "Bearer " + ScriptApp.getOAuthToken()},
  payload: JSON.stringify(payloadObject),
  muteHttpExceptions: true
  };


  try {
    const response = UrlFetchApp.fetch(WebAppUrl, options);
    Logger.log("Response: " + response.getContentText());
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log("Fetch Error: " + e.toString());
    return null;
  }
}

