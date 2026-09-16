function buildMenu() {
  var ui = SpreadsheetApp.getUi();

    // First Menu
    ui.createMenu('Admin Scripts')
      .addItem('Update paid members (Bulk update)', 'updatePaidMembers') 
      .addItem('Select member, (Paid,Request update)', 'selectMember')
      .addSeparator()
      .addItem('Request members update (to All)', 'sendUpdateEmails')
      .addItem('Send Membership renewal emails (to All)', 'sendRenewEmails')
      .addToUi();

    // Second Menu
    ui.createMenu('Email Lists')
      .addItem('Members', 'memberList')
      .addItem('Committee members', 'committeeMembersList')
      .addItem('Paid members', 'paidMembersList') 
      .addToUi();
  
}



function generateHexCode() {
  return Math.floor((1 + Math.random()) * 0x10000000).toString(16).substring(1);
}

function showAlert(msg) {
  const ui = SpreadsheetApp.getUi();
  ui.alert(msg);
}

function memberList(){
  listMembers("full");
}

function committeeMembersList(){
  listMembers("committee");  
}

function paidMembersList(){
  listMembers("paid");  
}

// Opens the Members List modal dialog with the selected filter
function listMembers(option) {
  const template = HtmlService.createTemplateFromFile('lists'); // Ensure filename matches 'lists.html'
  template.filterType = option || 'full';
  
  const htmlOutput = template.evaluate()
    .setWidth(1000)
    .setHeight(650);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Member list');
}

// Server function called when a member row is clicked in the modal
function openMemberDialog(email, filterType) {
  const template = HtmlService.createTemplateFromFile('member');
  template.memberMail = email;
  template.data = email;
  template.filterType = filterType || 'full'; // Preserves filter state

  const htmlOutput = template.evaluate()
    .setWidth(750)
    .setHeight(650);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Member Details');
}

// Fetch member and boat records (Sanitizes Dates to Strings for JSON)
function getMemberAndBoatData(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("Members");
  const classSheet = ss.getSheetByName("ClassMembers");
  
  const mData = memberSheet.getDataRange().getValues();
  const mHeaders = mData[0];
  let memberRow = null;
  
  const emailColIdx = mHeaders.indexOf("email");
  for (let i = 1; i < mData.length; i++) {
    if (String(mData[i][emailColIdx]).toLowerCase().trim() === String(email).toLowerCase().trim()) {
      memberRow = mData[i];
      break;
    }
  }
  
  if (!memberRow) return null;

  const cData = classSheet.getDataRange().getValues();
  const cHeaders = cData[0];
  let boatRows = [];
  
  const memberNameColIdx = mHeaders.indexOf("MemberName");
  const boatMemberColIdx = cHeaders.indexOf("Member");
  const currentMemberName = memberRow[memberNameColIdx];

  for (let j = 1; j < cData.length; j++) {
    if (String(cData[j][boatMemberColIdx]).trim() === String(currentMemberName).trim()) {
      boatRows.push({ rowNum: j + 1, data: cData[j] });
    }
  }
  
  // Format Member Object (Convert Dates/Objects to Strings to avoid JSON crashes)
  let memberObj = {};
  mHeaders.forEach((h, index) => {
    var key = String(h).trim(); 
    let val = memberRow ? memberRow[index] : "";
    if (val instanceof Date) {
      val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    memberObj[key] = val;
  });

  // Format Boats Array (Convert Dates/Objects to Strings)
  let boats = boatRows.map(b => {
    let obj = { _rowNum: b.rowNum };
    cHeaders.forEach((h, index) => {
      let val = b.data[index];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      obj[h] = val;
    });
    return obj;
  });
  
  return { member: memberObj, boats: boats };
}

// Fetch list of boat classes for dropdowns
function getClasses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Classes');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  // Skip header row (i = 1). Fetch Column B (index 1) for Class Name instead of Column A (index 0)
  const classes = [];
  for (let i = 1; i < data.length; i++) {
    const className = data[i][1]; // <--- Column B: Class Name
    if (className && className.toString().trim() !== '') {
      classes.push(className.toString().trim());
    }
  }
  return classes;
}

function sheetToObjects(ss, sheetName, keys) {
  try {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    
    const results = [];
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const obj = {};
      
      for (let i = 0; i < keys.length; i++) {
        // Ensure we don't read past the actual data returned in this row
        const cellValue = (i < row.length) ? row[i] : null;
        
        // Handle empty strings safely
        obj[keys[i]] = (cellValue === '' || cellValue === undefined) ? '' : cellValue;
      }
      
      // Temporary debug log to see exactly what is being parsed per row
      Logger.log(`Row ${r} parsed: ` + JSON.stringify(obj));
      
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error: ' + e);
    return [];
  }
}

function testAgentQuery() {
  const userQuery = "list of IOM sailors";
  
  // Call the function built in the previous step
  const response = queryMemberContactAgent(userQuery);
  
  Logger.log("=== GEMINI AGENT RESPONSE ===");
  Logger.log(response);
}