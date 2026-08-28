/**
 * Main HTTP POST entry point for Google Apps Script Web App
 */
function doPost(e) {
  console.log("in doPost of Race Results Automation")
  // Prevent concurrent executions from stepping on each other
  const lock = LockService.getScriptLock();
  
  // Wait up to 30 seconds for any running execution to finish
  if (!lock.tryLock(30000)) {
    return createJsonResponse({
      status: "error",
      message: "Server busy: lock timeout reached."
    });
  }

  try {
    // 1. Validate incoming post data
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No payload received in POST request.");
    }

    // 2. Parse the JSON string sent from Script B
    const data = JSON.parse(e.postData.contents);
    const parsed = data.parsed;
    const regattaType = data.raceType;

    // 3. Run your processing logic
    const processingResult = processNewRegattaSheets(parsed,regattaType);
    Logger.log("Result: " + processingResult);

    // 4. Return success response to Script B
    return createJsonResponse({
      status: "success",
      message: "Race results processed successfully.",
      summary: processingResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.log("Error handling doPost: " + error.toString());
    
    // Return error response back to Script B
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });

  } finally {
    // Always release the lock when finished
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