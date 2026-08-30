function updateUpcoming() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Event Data');
  updateUpcomingEvents(sh, 2, 9);
}
