function displayApplication(row) {
  console.log("In Display Application: " + row);
  var dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Membership Applications');
  var data = dataSheet.getRange(row, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  
  if (!data) return HtmlService.createHtmlOutput("Application not found.");

  var lastUpdated = new Date(data[27]);
  var today = new Date();
  var diffInTime = today.getTime() - lastUpdated.getTime();
  var diffInDays = diffInTime / (1000 * 3600 * 24);

  var isUrgent = diffInDays >= 2;
  var statusClass = isUrgent ? 'status-urgent' : 'status-normal';

  var signed = data[19] > "";
  var disclaimer = signed ? "Yes" : "No";

  // Parse combined string in data[24] into separate nominator and seconder comments
  var rawComments = String(data[24] || "");

  // Lookaheads ensure each match stops before reaching the other label or the end of the string
  var nomMatch = rawComments.match(/Nominator:\s*([\s\S]*?)(?=(?:Seconder:|$))/i);
  var secMatch = rawComments.match(/Seconder:\s*([\s\S]*?)(?=(?:Nominator:|$))/i);

  var nominatorComment = nomMatch ? nomMatch[1].trim() : "";
  var seconderComment = secMatch ? secMatch[1].trim() : "";

  // Fallback if neither "Nominator:" nor "Seconder:" tags were used
  if (!nomMatch && !secMatch) {
    nominatorComment = rawComments.trim();
  }

  Logger.log("Nom: " + nominatorComment);
  Logger.log("Sec: " + seconderComment);

  var appDetails = {
    rowId: row,
    status: data[1],
    timestamp: data[2],
    email: data[3],
    fullName: data[4] + " " + data[5],
    address: data[6] + ", " + data[20] + ", " + data[7],
    phone: data[8],
    emergency: data[9] + " (" + data[10] + ")",
    type: data[11],
    currentClub: data[12],
    nominator: data[13],
    seconder: data[14],
    nominatorComment: nominatorComment,
    seconderComment: seconderComment,
    rejectionReason: data[18],
    disclaimer: disclaimer,
    votesFor: data[25],
    votesAgainst: data[26],
    log: data[23],
    statusClass: statusClass,
    lastUpdatedStr: lastUpdated.toLocaleDateString()
  };

  var tmp = HtmlService.createTemplateFromFile('detailView');
  tmp.details = appDetails;
  
  return tmp.evaluate()
    .setTitle("Membership Application: " + appDetails.fullName)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
