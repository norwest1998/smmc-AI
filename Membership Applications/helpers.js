function updateReminderDate(row) {
  const ss = SpreadsheetApp.openByUrl(CONFIG.appLink);
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + 2);
  sheet.getRange(row, CONFIG.colReminderDate).setValue(Utilities.formatDate(reminderDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
  sheet.getRange(row, CONFIG.colStatusUpdated).setValue(new Date());

}

function testNo() {
var test = 418201928;
var result = formatPhoneDisplay(test);
Logger.log(result)

}

function formatPhoneDisplay(value) {
  if (value === null || value === undefined || value === "") return "";
  var digits = value.toString().replace(/\D/g, "");
  if (digits === "") return "";

  // Sheets strips a leading 0 when the cell is a Number — restore it
  if (digits.length === 9) digits = "0" + digits;
  if (digits.length === 8) digits = "02" + digits;

  if (digits.length !== 10) return value.toString(); // not a recognised AU number, leave as-is

  if (digits.substring (0,2) === "02") {
    return digits.substring(0, 2) + " " + digits.substring(2, 6) + " " + digits.substring(6, 10);
  } else { digits.substring()
    return digits.substring(0, 4) + " " + digits.substring(4, 7) + " " + digits.substring(7, 10);
  }
}

function addProcessNote(sheet, row, note){
  let noteRange = sheet.getRange(row, CONFIG.colProcessedNotes);
  let newNote = noteRange.getValue() + note + '\n';
  noteRange.setValue(newNote);
  console.log("Note Added: " + note + " to row: " + row);
}


// Updated getCommitteeEmails to optionally return names
function getCommitteeEmails(emailColumn, sendMailColumn, returnNames = false) {
  const committeeSpreadsheet = SpreadsheetApp.openById(CONFIG.masterDataID);
  const committeeSheet = committeeSpreadsheet.getSheetByName("Committee");
  const lastRow = committeeSheet.getLastRow();
  
  if (lastRow < 2) return [];

  const emailData = committeeSheet.getRange(2, emailColumn, lastRow - 1, 1).getValues();
  const sendMailData = committeeSheet.getRange(2, sendMailColumn, lastRow - 1, 1).getValues();
  
  let nameData = [];
  if (returnNames) {
    // Assuming Column 2 (B) is the Committee Member Name in the Committee Sheet
    nameData = committeeSheet.getRange(2, 2, lastRow - 1, 1).getValues(); 
  }
  
  const results = [];
  emailData.forEach((emailRow, index) => {
    const email = emailRow[0];
    const sendMail = sendMailData[index][0];
    if (sendMail === true && email) {
        if (returnNames) {
            results.push(nameData[index][0] || email); // Use name, or email as fallback
        } else {
            results.push(email);
        }
    }
  });
  return results;
}


function getCommittee() {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const sh = ss.getSheetByName('Committee');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  return data.slice(2).map(row => ({
    role: row[0],
    member: row[1],
    email: row[2],
    phone: row[3],
    notifyApplication: row[4],
    approveApplication: row[5]
  }));
}

function getApprovingCommitteeMembers() {
  const committee = getCommittee();
  return committee.filter(r => r.approveApplication === true);
}

function getNotificationCommitteeMembers() {
  const committee = getCommittee();
  return committee.filter(r => r.notifyApplication === true);
}

/**
 * Fetches active club member names from the Master sheet to populate nominators/seconders.
 */
function getMembersList() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
    const membersSheet = ss.getSheetByName("Members");
    if (!membersSheet) return [];
    
    const lastRow = membersSheet.getLastRow();
    if (lastRow < 2) return [];

    // Column C (index 3) contains full member names
    const data = membersSheet.getRange(2, 3, lastRow - 1, 1).getValues();
    const members = data
      .map(row => row[0] ? row[0].toString().trim() : '')
      .filter(name => name.length > 0)
      .sort();

    return Array.from(new Set(members));
  } catch (err) {
    console.log("Error getting members list: " + err.toString());
    return [];
  }
}



function getMemberByNumber(memberNo) {
  if (!memberNo) return null;

  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const sh = ss.getSheetByName('Members');

  if (!sh) throw new Error('Members sheet not found');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const currentMemberNo = row[0];

    if (String(currentMemberNo) === String(memberNo)) {
      return {
        rowNumber: i + 2,
        memberNo: row[0],
        active: row[1],
        name: row[2],
        membership: row[3],
        startDate: row[4],
        endDate: row[5],
        paidUp: row[6],
        phone: row[7],
        email: row[8],
        whatsapp: row[9],
        duplicate: row[10]
      };
    }
  }

  return null;
}



function renderMarkPaidPage(info) {
  if (!info || !info.applicantName) {
    return HtmlService.createHtmlOutput(
      '<h3>Invalid request</h3><p>Member number was not supplied.</p>'
    );
  }

  let member;
  try {
    member = getMemberByNumber(info.applicantName);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      `<h3>Error</h3><p>${err.message}</p>`
    );
  }

  if (!member) {
    return HtmlService.createHtmlOutput(
      `<h3>Member not found</h3><p>No member exists with Member number ${info.applicantName}.</p>`
    );
  }

  try {
    markMemberAsPaid(member.memberNo);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      `<h3>Payment error</h3><p>${err.message}</p>`
    );
  }

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px">
      <h2>Payment Recorded</h2>
      <p>Thank you. The membership payment has been successfully recorded.</p>
      <p><strong>Member:</strong> ${member.name || ''}</p>
      <p><strong>Member Number:</strong> ${member.memberNo}</p>
    </div>
  `;

  return HtmlService.createHtmlOutput(html)
    .setTitle('Payment Recorded');
}


