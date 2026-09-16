function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter.action;
  const sheetName = e.parameter.sheet;

  if (action === "fetch") {
    const fetchSheet = ss.getSheetByName(sheetName);
    if (!fetchSheet) return json({ error: `Sheet not found: ${sheetName}` });
    const values = fetchSheet.getDataRange().getValues();
    return json({ values });
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.sheet);

    // --- OTHER POST ACTIONS (update, append, etc.) ---
  if (body.action === "sendReviewNotification") {
      try {
          var docTitle = body.docTitle;
          var docLink = body.docLink;
          var category = body.category;
          var version = body.version;
          var uploader = body.uploader;

          // Fetch Committee Email Addresses from Members Sheet or array
          var committeeEmails = getCommitteeMemberEmails(); 
          
          if (committeeEmails.length === 0) {
              return ContentService.createTextOutput(JSON.stringify({ 
                  status: "warning", 
                  message: "No committee email recipients found." 
              })).setMimeType(ContentService.MimeType.JSON);
          }

          var subject = "Document Open for Review: " + docTitle;
          var emailBody = 
              "Hello Committee Member,\n\n" +
              "A document has been set to 'Open for Review' by " + uploader + ".\n\n" +
              "• Title: " + docTitle + "\n" +
              "• Category: " + category + "\n" +
              "• Version: v" + version + "\n" +
              "• Document Link: " + docLink + "\n\n" +
              "Please open the link above to review the document.\n\n" +
              "Regards,\n" +
              "Sydney Maritime Modellers Club Console";

          // Send batch email to committee
          MailApp.sendEmail({
              to: committeeEmails.join(","),
              subject: subject,
              body: emailBody
          });

          return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
              .setMimeType(ContentService.MimeType.JSON);

      } catch (err) {
          return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
              .setMimeType(ContentService.MimeType.JSON);
      }
  }



  if (body.action === "update") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const hexCol = headers.indexOf("HexKey") + 1;
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(r => r[hexCol - 1] === body.hexKey);
    if (rowIndex === -1) return json({ error: "HexKey not found" }, 404);
    try {
      Object.entries(body.updates).forEach(([field, value]) => {
        const col = headers.indexOf(field) + 1;
        if (col > 0) sheet.getRange(rowIndex + 1, col).setValue(value);
      });
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
              .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
          return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
              .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (body.action === "append") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(h => body.rowData[h] ?? "");
    try {
      sheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
              .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return json({ error: "Unknown action" }, 400);
}


// Helper function to extract emails from Members sheet
function getCommitteeMemberEmails() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Members");
    if (!sheet) return ["committee@smmc.org.au"]; // Fallback email

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var emailIdx = headers.indexOf("email");
    var roleIdx = headers.indexOf("role");

    var emails = [];
    for (var i = 1; i < data.length; i++) {
        var role = String(data[i][roleIdx] || "").toLowerCase();
        var email = String(data[i][emailIdx] || "").trim();
        
        // Filter by Committee role or include all active committee rows
        if (email && (role.indexOf("committee") !== -1 || role.indexOf("executive") !== -1 || role.indexOf("secretary") !== -1)) {
            emails.push(email);
        }
    }
    return emails.length > 0 ? emails : ["committee@smmc.org.au"];
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}