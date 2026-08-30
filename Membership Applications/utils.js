
/**
 * Utility: formats a date into yyyy-MM-dd
 */
function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function getSheetLink() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}

