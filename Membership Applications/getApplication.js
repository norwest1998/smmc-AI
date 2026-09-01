function displayApplication(rowId){

  var dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Membership Applications');
  var data = dataSheet.getRange().getValues();
  
  if (!data) return HtmlService.createHtmlOutput("Membership application not found.");

  for (var i = 0; i < data.length; i++) {
    if (data[i][0] == rowId) {
      var lastUpdated = new Date(data[i][27]);
      var today = new Date();
      var diffInTime = today.getTime() - lastUpdated.getTime();
      var diffInDays = diffInTime / (1000 * 3600 * 24);

      var isUrgent = diffInDays >= 2;
      var statusClass = isUrgent ? 'status-urgent' : 'status-normal';

      var signed = data[i][19] > "";
      var disclaimer = signed ? "Yes" : "No";

      // Parse combined string in data[24] into separate nominator and seconder comments
      var rawComments = String(data[i][24] || "");

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
        status: data[i][1],
        timestamp: data[i][2],
        email: data[i][3],
        fullName: data[i][4] + " " + data[i][5],
        address: data[i][6] + ", " + data[i][20] + ", " + data[i][7],
        phone: data[i][8],
        emergency: data[i][9] + " (" + data[i][10] + ")",
        type: data[i][11],
        currentClub: data[i][12],
        nominator: data[i][13],
        seconder: data[i][14],
        nominatorComment: nominatorComment,
        seconderComment: seconderComment,
        rejectionReason: data[i][18],
        disclaimer: disclaimer,
        votesFor: data[i][25],
        votesAgainst: data[i][26],
        log: data[i][23],
        statusClass: statusClass,
        lastUpdatedStr: lastUpdated.toLocaleDateString()
      };

      return appDetails;
    }
  }; 



}
