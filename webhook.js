/* webhook.gs
* Deployable Web App to trigger Regatta Agent via HTTP POST.
*/
function AAAAAAAAAAAAAAAAdoPost(e) {
  try {
  // Optional: parse JSON payload
  const payload = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};

  // Call main orchestrator
  processNewRegattaSheets();

  // Return success response
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'Regatta sheets processed successfully.'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}