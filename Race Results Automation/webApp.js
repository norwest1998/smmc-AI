/**
 * Main HTTP POST entry point for Google Apps Script Web App
 */
function doPost(e) {
  console.log("in doPost of Race Results Automation");
  const lock = LockService.getScriptLock();
  
  if (!lock.tryLock(30000)) {
    return createJsonResponse({
      status: "error",
      message: "Server busy: lock timeout reached."
    });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No payload received in POST request.");
    }

    const data = JSON.parse(e.postData.contents);
    const parsed = data.parsed;
    const regattaType = data.raceType;
    
    // Extract fileId from the webhook payload
    const fileId = data.fileId; 

    // Pass fileId into the main routine
    const processingResult = processNewRegattaSheets(parsed, regattaType, fileId);
    Logger.log("Result: " + processingResult);

    return createJsonResponse({
      status: "success",
      message: "Race results processed successfully.",
      summary: processingResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.log("Error handling doPost: " + error.toString());
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Helper to construct a standardized JSON HTTP response
 */
function createJsonResponse(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject))
    .setMimeType(ContentService.MimeType.JSON);
}