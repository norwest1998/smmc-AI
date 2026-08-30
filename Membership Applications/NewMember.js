/**
 * Adds an approved member to the Members sheet in the Club Management workbook.
 * This is called once an application is marked as Approved.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} appSheet - MembershipApplications sheet
 * @param {number} row - row index of the approved applicant
 */
function addApprovedMemberToMembersSheet(appSheet, row) {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const membersSheet = ss.getSheetByName('Members');
  if (!membersSheet) throw new Error('"Members" sheet not found in Club Management workbook.');

  // Read application data
  const firstName = appSheet.getRange(row, CONFIG.colFirstName).getValue();   
  const surname = appSheet.getRange(row, CONFIG.colSurname).getValue();     
  const email = appSheet.getRange(row, CONFIG.colEmail).getValue();       
  const phone = formatPhoneDisplay(appSheet.getRange(row, CONFIG.colPhone).getValue());      
  var membershipType = appSheet.getRange(row, CONFIG.colMembershipType).getValue(); 
  const address = appSheet.getRange(row,CONFIG.colAddress).getValue();
  const city = appSheet.getRange(row,CONFIG.colCity).getValue(); 
  const pCode = appSheet.getRange(row,CONFIG.colPCode).getValue();
  const eContact = appSheet.getRange(row, CONFIG.colEContact).getValue();
  const eNumber = formatPhoneDisplay(appSheet.getRange(row, CONFIG.colEContactPh).getValue());
  const approvedDate = new Date();
  const homeClub = appSheet.getRange(row, CONFIG.colCurrentClub).getValue();

  // Format name
  const fullName = `${firstName} ${surname}`.trim();

  // Shorten Memberhip type
  if(membershipType === 'Full Membership') {
    membershipType = 'Full';
  } else {
    membershipType = 'Affiliate';
  }

  // Determine the next available Member Number (Column A)
  const lastRow = membersSheet.getLastRow();
  let nextMemberNo = 1;
  if (lastRow >= 2) {
    nextMemberNo = lastRow;
  }

  // Calculate end of financial year (June 30)
  const year = approvedDate.getMonth() >= 6
    ? approvedDate.getFullYear() + 1
    : approvedDate.getFullYear();
  const endOfFY = new Date(year, 6, 30);  // 30 June

  // Prepare record according to sheet structure
  const rowData = [
    nextMemberNo,     // Member No
    ,                 // Active
    fullName,         // MemberName
    membershipType,   // Membership
    approvedDate,     // Start Date
    endOfFY,          // End Date
    false,            // Paid Up (checkbox empty)
    phone,            // Phone
    email,            // Email
    false,            // WhatsApp (checkbox empty)
    ,                 // Duplicate (formula will populate itself)
    address,          // address line
    city,             // City
    pCode,            // post code
    eContact,         // Emergency Contact
    eNumber,          // Emergency Number
    false,            // Calendar Subscription
    homeClub
  ];

  membersSheet.appendRow(rowData);

  // Apply date formats for clarity
  const newRow = membersSheet.getLastRow();
  membersSheet.getRange(newRow, 5).setNumberFormat("yyyy-MM-dd");
  membersSheet.getRange(newRow, 6).setNumberFormat("yyyy-MM-dd");

  // Notify Treasurer
  notifyTreasurerOfNewMember({
    number: nextMemberNo,
    name: fullName,
    membership: membershipType,
    startDate: approvedDate,
    endDate: endOfFY,
    phone: phone,
    email: email
  });
}

/**
 * Sends the Treasurer an email to watch for incoming payment for a newly approved member.
 *
 * @param {Object} member - Object containing member data:
 *   { number, name, membership, startDate, endDate, phone, email }
 */
function notifyTreasurerOfNewMember(member) {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const committeeSheet = ss.getSheetByName('Committee');
  if (!committeeSheet) throw new Error('"Committee" sheet not found.');

  const data = committeeSheet.getDataRange().getValues();
  const header = data[1];   // headers are in ROW 2
  const roleCol = header.indexOf('Role');
  const emailCol = header.indexOf('Email');

  if (roleCol < 0 || emailCol < 0) throw new Error('Committee sheet headers missing.');

  // Find Treasurer row
  const treasurerRow = data.find((row, idx) =>
    idx > 1 && String(row[roleCol]).trim().toLowerCase() === 'treasurer'
  );

  if (!treasurerRow) return; // No Treasurer found — silently skip

  const treasurerEmail = treasurerRow[emailCol];
  if (!treasurerEmail) return;

  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 14); // Tokens expire in 14 days
  const type = 'markPaid'
  
  const paymentToken = generateToken(type, member.email, member.number,'', expiry);
  const webappUrl = CONFIG.webAppURL;
  const markPaidLink = `${webappUrl}?action='markPaid'&token=${paymentToken}`;

  const subject = `New Member Payment Expected – ${member.name}`;
  const textBody =
    `Dear Treasurer,\n\n` +
    `A new member has been approved and added to the Members database.\n\n` +
    `Please watch for membership payment from:\n\n` +
    `Member No: ${member.number}\n` +
    `Name: ${member.name}\n` +
    `Membership Type: ${member.membership}\n` +
    `Email: ${member.email}\n` +
    `Phone: ${member.phone}\n` +
    `Start Date: ${formatDate(member.startDate)}\n` +
    `End Date: ${formatDate(member.endDate)}\n\n` +
    `Mark Member as Paid: ${markPaidLink}\n\n` +
    `Best regards,\nSMMC Admin AutoBot`;

  const htmlBody =
    `<p>Dear Treasurer,</p>` +
    `<p>A new member has been <strong>approved</strong> and added to the Members database.</p>` +
    `<ul>` +
    `<li><strong>Member No:</strong> ${member.number}</li>` +
    `<li><strong>Name:</strong> ${member.name}</li>` +
    `<li><strong>Membership Type:</strong> ${member.membership}</li>` +
    `<li><strong>Email:</strong> ${member.email}</li>` +
    `<li><strong>Phone:</strong> ${member.phone}</li>` +
    `<li><strong>Start Date:</strong> ${formatDate(member.startDate)}</li>` +
    `<li><strong>End Date:</strong> ${formatDate(member.endDate)}</li>` +
    `</ul>` +
    `<p>Please keep an eye out for their membership payment.</p>` +
    `<p><a href="${markPaidLink}" 
      style="padding:10px 16px; background:#2c7; color:white; 
      text-decoration:none; border-radius:6px;">
      Mark Member as Paid
     </a></p>` +
    `<p>Best regards,<br>SMMC Admin AutoBot</p>`;
  MailApp.sendEmail({to: treasurerEmail, subject: subject, body: textBody, htmlBody: htmlBody});

}

function markMemberAsPaid(memberNo) {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const membersSheet = ss.getSheetByName('Members');

  const data = membersSheet.getDataRange().getValues();
  const header = data[1];
  const memberCol = 0; // Column A
  const paidUpCol = header.indexOf('Paid up');

  for (let i = 2; i < data.length; i++) {
    if (Number(data[i][memberCol]) === memberNo) {
      membersSheet.getRange(i+1, paidUpCol+1).setValue(true);

      // Return for success
      return {
        number: memberNo,
        name: data[i][2]
      };
    }
  }

  return null;
}