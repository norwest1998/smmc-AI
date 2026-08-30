function checkReminderAndSendEmail() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.membershipSheetName);
  const applicationLink = CONFIG.appLink;
  const currentDate = new Date();
  const rows = sheet.getDataRange().getValues();
  const committeeEmails = getCommitteeEmails(3, 5); // General Committee Emails for Reminder

  for (let [i, row] of rows.slice(7).entries()) {
    const rowIndex = i + 8; // Row index in the sheet (1-based)
    const status = row[CONFIG.colStatus - 1];
    const timestamp = row[CONFIG.colTimestamp - 1]; // Column C (Timestamp)
    
    if (!timestamp || status === 'Processed') continue;

    const nominationDate = row[CONFIG.colNominationDate - 1];
    const seconderNominationDate = row[CONFIG.colSeconderDate - 1];
    const applicantName = `${row[CONFIG.colFirstName -1 ]} ${row[CONFIG.colSurname - 1]}`; // Name (E) and Surname (F)
    const reminderDate = row[CONFIG.colReminderDate - 1];
    
    // 1. Check if Nomination/Seconder responses received and update status
    if (nominationDate && seconderNominationDate && status !== "Awaiting Approval") {
      sheet.getRange(rowIndex, CONFIG.colStatus).setValue("Awaiting Approval");
      if (committeeEmails.length && applicantName) sendAwaitingApprovalEmail(committeeEmails, timestamp, applicantName, applicationLink, rowIndex);
    }

    // 2. Check for reminder email
    if (reminderDate <= currentDate && status !== 'Processed') {
      if (committeeEmails.length && applicantName) sendReminderEmail(committeeEmails, timestamp, applicantName, applicationLink, sheet, rowIndex);
    }
  }
}

/**
 * Sends a reminder email and updates the reminder date.
 */
function sendReminderEmail(committeeEmails, timestamp, applicantName, applicationLink, sheet, rowIndex) {
  if (!applicantName || !applicationLink) return;
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
  const appLink = CONFIG.webAppURL + `?token=${rowIndex}`;
  const plainTextBody = `Dear Committee Member,
This is a notification that an application has not been progressed in the last 2 days.
Please review and update at your earliest convenience:
Applicant: ${applicantName}
Timestamp: ${formattedTimestamp}
You can view the membership application here:
${appLink}
Best regards,
SMMC Admin AI`;

  const htmlBody = `<p>Dear Committee Member,</p>
<p>This is a notification that an application has not been progressed in the last 2 days.</p>
<ul><li>Applicant: ${applicantName}</li><li>Timestamp: ${formattedTimestamp}</li></ul>
<p>You can view the membership application here:<br><br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Google Drive sheet</span></a></p>
<p>Best regards,<br>SMMC Admin AI</p>`;

  MailApp.sendEmail({to: committeeEmails.join(','), subject: "Reminder: Application Pending Progress", body: plainTextBody, htmlBody: htmlBody});
  
  // Update Reminder Date (T) after sending
  updateReminderDate(rowIndex);
  
  // Update Processed Notes (V)
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  addProcessNote(sheet, rowIndex, `Reminder email sent and Reminder date updated at:${myDateTime}`);
}

/**
 * Sends a general notification email that the application is ready for approval.
 * (This is separate from the secure voting request in Responses.gs).
 */
function sendAwaitingApprovalEmail(committeeEmails, timestamp, applicantName, applicationLink, rowIndex) {
  if (!applicantName || !applicationLink) return;
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
  const appLink = CONFIG.webAppURL + `?token=${rowIndex}`;
  const plainTextBody = `Dear Committee Member,
This is a notification that an application has been processed and is ready for committee review.
Please check the sheet and await the secure voting link email.
Applicant: ${applicantName}
Timestamp: ${formattedTimestamp}
You can view the membership application here:
${appLink}
Best regards,
SMMC Admin AI`;
  
  const emailBody = `<p>Dear Committee Member,</p>
<p>This is a notification that an application has been processed and is ready for committee review.</p>
<p>Please check the sheet and await the secure voting link email.</p>
<ul><li>Applicant: ${applicantName}</li><li>Timestamp: ${formattedTimestamp}</li></ul>
<p>You can view the membership application here:<br><br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Google Drive sheet</span></a></p>
<p>Best regards,<br>SMMC Admin AI</p>`;
  
  MailApp.sendEmail({to: committeeEmails.join(','), subject: "New Application Ready for Review", body: plainTextBody, htmlBody: emailBody});
}

