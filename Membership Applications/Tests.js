function testNominationDateUpdate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
  const row = 8;
console.log("Sheet: " + sheet.getName());
  updateNominationStatus(sheet,row);

}

function triggerAuth() {
  var url = ScriptApp.getService().getUrl();
    const webAppUrl =  CONFIG.webAppURL || ScriptApp.getService().getUrl(); 
  Logger.log(webAppUrl);
}

function generateMyToken(){

  var type = 'markPaid';
  var name = "John Wyatt";
  var number = 3;
  var expiry = new (Date);
  const lockSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tokens');
  if (!lockSheet) {
    console.log('Token Lock sheet not found. Cannot send approval request with secure links.');
    return;
  }

  const token = generateToken(type, name, number,'', expiry);
  lockSheet.appendRow([token, type, name, number, false, expiry]); // Token, Row Index, Used, Expiry
  
  let result = null;

  result = validateToken(token);
  Logger.log("Valid: " + result.valid);
  Logger.log("Reason: " + result.reason);
  Logger.log("result.type: " + result.type);
  Logger.log("result.email " + result.cName);
  Logger.log("result.param " + result.row);
  Logger.log("result.row " + result.rowId);

  result = verifyToken(token)
  Logger.log("Valid: " + result.valid);
  Logger.log("token: " + result.tokenString);
  Logger.log("type: " + result.type);
  Logger.log("commiteeMember " + result.committeeMember);
  Logger.log("applicantName " + result.applicantName);
  Logger.log("applicantRowID " + result.applicantRowID);
  Logger.log("timestamp " + result.timestamp);

}

function validateMyToken(){

  var token = "bWFya1BhaWR8Sm9obiBXeWF0dHwzfHxUaHUgQXVnIDEzIDIwMjYgMTk6MDM6MzYgR01UKzEwMDAgKEF1c3RyYWxpYW4gRWFzdGVybiBTdGFuZGFyZCBUaW1lKXw1OWMxMDU4ODgyYzA1ZTMyMmVkNWE2YzE0ODIzNmUwZWI5NGJmMTZkZWRjNzlmNjE3ZDY1MThkNmJhMWE3ZjE0"
  var result = validateToken(token);
  Logger.log("Valid: " + result.valid);
  Logger.log("Reason: " + result.reason);
  Logger.log("result.type: " + result.type);
  Logger.log("result.email " + result.cName);
  Logger.log("result.param " + result.row);
  Logger.log("result.row " + result.rowId);

}

function verifyMyToken(){
  var token = "bWFya1BhaWR8Sm9obiBXeWF0dHwzfHxUaHUgQXVnIDEzIDIwMjYgMTk6MDM6MzYgR01UKzEwMDAgKEF1c3RyYWxpYW4gRWFzdGVybiBTdGFuZGFyZCBUaW1lKXw1OWMxMDU4ODgyYzA1ZTMyMmVkNWE2YzE0ODIzNmUwZWI5NGJmMTZkZWRjNzlmNjE3ZDY1MThkNmJhMWE3ZjE0"

  result = verifyToken(token)
  Logger.log("Valid: " + result.valid);
  Logger.log("token: " + result.tokenString);
  Logger.log("type: " + result.type);
  Logger.log("commiteeMember " + result.committeeMember);
  Logger.log("applicantName " + result.applicantName);
  Logger.log("applicantRowID " + result.applicantRowID);
  Logger.log("timestamp " + result.timestamp);
}


function testDisplayApplication() {
  // 1. Create a mock event object simulating ?token=8
  var mockEvent = {
    parameter: {
      token: "8" // Change this number to test different rows
    }
  };
  var display = displayApplication(8);
  // 2. Call your doGet function with the mock data
  var output = doGet(mockEvent);
  
  // 3. Log the HTML content to the execution log
  // This helps verify that the HTML is being generated without errors
  Logger.log("Content Title: " + output.getTitle());
  Logger.log("HTML Preview: " + output.getContent().substring(0, 500) + "...");
}

function richTextTest(){

  const text = "Seconder: ";
  const comment = "this is a comment";
  richTextTest(text);
  comment = text + comment;
  console.log("text: " + comment);
}

function testDeliberationEmails() {

  const ss = SpreadsheetApp.openById('1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk');
  const sheet = ss.getSheetByName('Membership Applications');
  const row = 8
  sendDeliberationEmails(sheet, row);
}

