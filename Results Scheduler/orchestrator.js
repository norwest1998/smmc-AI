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

  // 1. EXTRACT file ID here
  const fileId = file.getId();
  const parsed = parseSimplifiedRegattaSheet(fileId);

  Logger.log("EventID: " + parsed.eventID + " regattaName: " + parsed.regattaName);

  var raceType = 'Scratch';
  const regattaName = (parsed.regattaName || '').trim();
  const regattaType = regattaName ? regattaName.split(' ').slice(1).join(' ') : '';
  if ((regattaName === 'IOM Racing') || regattaType === 'Handicap') {
    raceType = 'Handicap';
  }

  // 2. Pass fileId down to the WebApp
  const result = callResultsWebApp(parsed, raceType, fileId);
  Logger.log("Result: " + JSON.stringify(result));

  if (result && result.status === "success") {
    // Archiving & Calendar logic removed - now handled safely inside the WebApp!
    
    // 3. Schedule trigger for the NEXT unprocessed event
    scheduleNextEventTrigger();

  } else {
    const errMsg = (result && result.message) || 'Unknown error';
    file.setDescription(`Failed, error, ${errMsg}`);
    Logger.log('Failed to process via Script A: ' + errMsg + '. Retrying in 5 minutes...');
    createDelayTrigger(5, 'checkAndProcessJson');
  }
}

function callResultsWebApp(parsed, raceType, fileId) {
  // Add fileId to the payload
  const payloadObject = { parsed: parsed, raceType: raceType, fileId: fileId };
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
    return { status: "error", message: e.message || e.toString() };
  }
}