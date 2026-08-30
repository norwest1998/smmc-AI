function myFunction() {
  var calendarId = 'Primary'; 
  var calendar = CalendarApp.getCalendarById(calendarId);
  
  // Fetch calendar events for the next 120 days to locate active series
  var now = new Date();
  var futureWindow = new Date(now.getTime() + (120 * 24 * 60 * 60 * 1000));
  var existingCalendarEvents = calendar.getEvents(now, futureWindow);
  
}


function getCellImageAsBase64(cellImage) {
  if (!cellImage || typeof cellImage.getContentUrl !== 'function') return '';
  
  const url = cellImage.getContentUrl();
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  
  const blob = response.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());
  return `data:${blob.getContentType()};base64,${base64}`;
}

function testPic() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Web doGet Datasheet');

  const picCell = sheet.getRange('E2').getValue();
  const picUrl = picCell ? picCell.getContentUrl() : '';
  
  const base64Image = getCellImageAsBase64(picCell);

  Logger.log(picUrl); // Use this base64 string directly in your HTML <img src="...">
  return base64Image;
}