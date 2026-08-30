// Helper function to send the final approval/rejection email to the applicant
function sendFinalApplicantEmail(sheet, row, finalStatus) {
  const applicantEmail = sheet.getRange(row, CONFIG.colEmail).getValue();
  const membershipType = sheet.getRange(row, CONFIG.colMembershipType).getValue();

  const whatsAppLink = PropertiesService.getScriptProperties().getProperty("WhatsAppInviteURL");
  const facebookLink = PropertiesService.getScriptProperties().getProperty("FacebookURL");
  const websiteLink = PropertiesService.getScriptProperties().getProperty("ClubWebsiteURL");

  let plainTextBody = null;
  let htmlBody      = null;

  if (finalStatus === "Approved") {
    const subject = "SMMC Membership Application Approved";
    plainTextBody = `Dear Applicant,\n\nCongratulations! Your application has been approved.`;
    htmlBody = `<p>Dear Applicant,</p><p>Congratulations! Your application has been approved.</p>`;

    if (membershipType.includes("Full")) {
          plainTextBody += `\n\nPlease ensure you pay the following fees:\nJoining Fee: $15\nAnnual Membership (Full): $45\nTotal: $60`;
          htmlBody += `<p>Please ensure you pay the following fees:</p><ul><li>Joining Fee: $15</li><li>Annual Membership (Full): $45</li><li>Total: $60</li></ul>`;
    } else {
          plainTextBody += `\n\nPlease ensure you pay the following fees:\nJoining Fee: $15\nAffiliated Club member: $30\nTotal: $45`;
          htmlBody += `<p>Please ensure you pay the following fees:</p><ul><li>Joining Fee: $15</li><li>Affiliated Club member: $30</li><li>Total: $45</li></ul>`;
    }
    // Fetch the image blobs (or host them in your Google Drive)
    const whatsappBlob = UrlFetchApp.fetch("https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg").getBlob().setName("whatsapp");
    const facebookBlob = UrlFetchApp.fetch("https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png").getBlob().setName("facebook");

    plainTextBody = `\n\nPlease join our community on Social Media:\nWhatsApp: ${whatsAppLink}\nFacebook: ${facebookLink}\nKeep an eye on the club web site for sailing calendar and updates: ${websiteLink}\n\nBest regards,\nThe SMMC Committee`;

    htmlBody = `<p>Please join our community on Social Media:</p>
    <p><a href="${whatsAppLink}" target="_blank" style="text-decoration: none; color: #000;">
    <img src="cid:whatsappLogo" width="32" height="32" style="vertical-align:middle; margin-right: 8px;"><span style="font-size: 14px; vertical-align:middle;">Join WhatsApp</span></a></p>
    <p><a href="${facebookLink}" target="_blank" style="text-decoration: none; color: #000;">
    <img src="cid:facebookLogo" width="32" height="32" style="vertical-align:middle; margin-right: 8px;"><span style="font-size: 14px; vertical-align:middle;">Join Facebook</span></a></p>
    <p><a href="${websiteLink}" target="_blank" style="text-decoration: none; color: #000;">
    <img src="https://smmc1998.weebly.com/uploads/1/0/2/3/102349134/smmc-logo.jpg" width="32" height="32" style="vertical-align:middle; margin-right: 8px;"><span style="font-size: 14px; vertical-align:middle;">Keep an eye on the club web site for sailing calendar and updates</span></a></p>
    <p>Best regards,<br>The SMMC Committee</p>`;

    MailApp.sendEmail({
      to: applicantEmail, 
      subject: subject, 
      body: plainTextBody, 
      htmlBody: htmlBody,
      inlineImages: {
        whatsappLogo: whatsappBlob,
        facebookLogo: facebookBlob
      }
    }); 
  } else if (finalStatus === "Rejected") {
      plainTextBody = `Dear Applicant,\nWe regret to inform you that your application has not been approved.\nWe thank you for your interest in joining our club.\n\nBest regards,\nThe SMMC Committee`;
      const htmlBody = `<p>Dear Applicant,</p><p>We regret to inform you that your application has not been approved.</p><p>We thank you for your interest in joining our club.</p><p>Best regards,<br>The SMMC Committee</p>`;
      MailApp.sendEmail({to: applicantEmail, subject: "Application Rejected", body: plainTextBody, htmlBody});
  }
}

/**
 * Sends a notification and unique web form link to *all* approving committee members.
 */
function sendCommitteeApprovalRequest(sheet, applicantRow) {
console.log("In sendCommitteeApprovalRequest, applicantRow: " + applicantRow);
  const allCommitteeEmails = getCommitteeEmails(3, 6); // Column 6 (Send Vote Mail)
  const rowId = sheet.getRange(applicantRow, CONFIG.colRowID).getValue();
  const committeeNames = getCommitteeEmails(2, 6, true); // Column 2 (Name), Column 6 (Send Vote Mail)
  const applicantName = sheet.getRange(applicantRow, CONFIG.colFirstName).getValue() + " " + sheet.getRange(applicantRow, CONFIG.colSurname).getValue();
  const applicantEmail = sheet.getRange(applicantRow, CONFIG.colEmail).getValue();
  const timestamp = sheet.getRange(applicantRow, CONFIG.colTimestamp).getValue();
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});

  // Get the published Web App URL (must be manually published first!)
  
  const lockSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tokens');
  
  if (!lockSheet) {
    console.log('Token Lock sheet not found. Cannot send approval request with secure links.');
    return;
  }
  
  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 14); // Tokens expire in 14 days
  
  if (allCommitteeEmails.length > 0) {
    allCommitteeEmails.forEach((committeeEmail, index) => {
      const committeeName = committeeNames[index];
      const type = 'vote';
      const token = generateToken(type, committeeName, applicantName, rowId, expiry);
   
      // 1. Save Token to Lock Sheet
      lockSheet.appendRow([token, type, committeeName, rowId, false, expiry]); // Token, Row Index, Used, Expiry
      var urltoken = encodeURIComponent(token); 
      
      // 2. Create Vote URL
      const voteUrl = `${CONFIG.webAppURL}?token=${urltoken}&member=${encodeURIComponent(committeeEmail)}&applicant=${encodeURIComponent(applicantName)}`;
      
      // 3. Send Individual Email
      const emailSubject = 'New membership application awaiting your vote: ' + applicantName;
      const {plainTextBody, htmlBody} = createVoteRequestEmail(committeeName, applicantName, applicantRow, applicantEmail, formattedTimestamp, voteUrl);
      addProcessNote(sheet, applicantRow, `Approval vote request sent to: ${committeeEmail} at: ${formattedTimestamp}`);
      MailApp.sendEmail({to: committeeEmail, subject: emailSubject, body: plainTextBody, htmlBody: htmlBody});
      console.log(`Sent vote request to ${committeeEmail} for application ${applicantName}`);
    });
  }
}

// Full vote request email template
function createVoteRequestEmail(committeeName, applicantName, applicantRow, applicantEmail, formattedTimestamp, voteUrl) {
  const appLink = CONFIG.webAppURL + `?token=${applicantRow}`;
  const plainTextBody = `Dear ${committeeName},
A membership application for ${applicantName} has been processed and is now awaiting your official vote.
Applicant: ${applicantName}
Email: ${applicantEmail}
Submitted: ${formattedTimestamp}

Please click the secure link below to cast your vote (Approved or Rejected with reason):
${voteUrl}

Review the application details here:
${appLink}

Best regards,
Your Admin AutoBot`;

  const htmlBody = `<p>Dear ${committeeName},</p>
<p>An application for <b>${applicantName}</b> has been processed and is now awaiting your official vote.</p>
<ul>
<li>Applicant: ${applicantName}</li>
<li>Email: ${applicantEmail}</li>
<li>Submitted: ${formattedTimestamp}</li>
</ul>

<p><b>Please cast your vote using the secure link below:</b></p>
<p><a href="${voteUrl}" target="_blank" style="text-decoration: none; background-color: #4CAF50; color: white; padding: 10px 20px; text-align: center; display: inline-block; border-radius: 5px;">
<span style="font-size: 16px; vertical-align:middle;">Cast Your Vote Now</span>
</a></p>

<p>You can review the application details here:<br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Google sheet</span></a></p>

<p>Best regards,<br>Your Admin AutoBot</p>`;

    return {plainTextBody, htmlBody};
}

// Helper function for Committee Notification Email
function createCommitteeNotificationEmail(applicantName, applicantRow, applicantEmail, myDateTime) {
  const applicationLink = CONFIG.webAppURL + "?token=" + applicantRow;
  const plainTextBody = `Committee member,
A new application has been submitted.
Applicant: ${applicantName}
Email: ${applicantEmail}
Submitted: ${myDateTime}
Please view the application in the link below to assess the submission.
Application Link: ${applicationLink}
Your Admin AutoBot`;
    
    const htmlBody = `<p>Committee member,</p>
<p>A new member application has been submitted.</p>
<p>Please view the application in the link below to assess the submission.</p>
<ul>
<li>Applicant: ${applicantName}</li>
<li>Email : ${applicantEmail}</li>
<li>Submitted: ${myDateTime}</li>
</ul>
<p>Thank you for your assistance.</p>
<p>You can view the application here:<br><br>
<a href="${applicationLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open application" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">View the membership application</span>
</a></p>
<p>Best regards,<br>Your Admin AutoBot</p>`;
    
    return {plainTextBody, htmlBody};
}

// Helper function for Nominator/Seconder Email
function createNominatorSeconderEmail(role, applicantName, applicantRow, applicantEmail, myDateTime, baseURL) {
  const appLink = CONFIG.webAppURL + "?token=" + applicantRow;
  const plainTextBody = `${role} member,
A new application has been submitted with you as a ${role.toLowerCase()} member.
Applicant: ${applicantName}
Email: ${applicantEmail}
Submitted: ${myDateTime}
Please provide your comments on this application using the form in the link below.
Application Link: ${baseURL}

You can view the application here: ${appLink}
Your Admin AutoBot`;

    const htmlBody = `<p>${role} member,</p>
<p>A new member application has been submitted.</p>
<ul><li>Applicant: ${applicantName}</li><li>Email : ${applicantEmail}</li><li>Submitted: ${myDateTime}</li></ul>
<p>Thank you for your assistance.</p>
<p>You can access the nomination form here:<br><br>
<a href="${baseURL}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Form" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Member Nomination Form from the SMMC Google Drive</span></a></p>

<p>You can review the application here:<br><br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open application" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">View the Application from the SMMC Google Drive</span></a></p>

<p>Best regards,<br>Your Admin AutoBot</p>`;
    
    return {plainTextBody, htmlBody};
}

function sendDeliberationEmails(sheet, row) {

  // get voting committeee members
  // show Against voting member
  // show rejection reason
  // show application record
  // create new vote token 
  // create new vote Url 
  // send email 
  // update process notes

  console.log("In sendDeliberationEmails, row: " + row);

  const allCommitteeEmails = getCommitteeEmails(3, 6); // Column 6 (Send Vote Mail)
  const rowId = sheet.getRange(row, CONFIG.colRowID).getValue();
  const committeeNames = getCommitteeEmails(2, 6, true); // Column 2 (Name), Column 6 (Send Vote Mail)
  const applicantName = sheet.getRange(row, CONFIG.colFirstName).getValue() + " " + sheet.getRange(row, CONFIG.colSurname).getValue();
  const applicantEmail = sheet.getRange(row, CONFIG.colEmail).getValue();
  const timestamp = sheet.getRange(row, CONFIG.colTimestamp).getValue();
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
  const rejectedBy = sheet.getRange(row, CONFIG.colVotesAgainst).getValue();
  const reason = sheet.getRange(row, CONFIG.colRejectionReason).getValue();

  // Get the published Web App URL (must be manually published first!)
  
  const lockSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tokens');
  
  if (!lockSheet) {
    console.log('Token Lock sheet not found. Cannot send approval request with secure links.');
    return;
  }
  
  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 14); // Tokens expire in 14 days

  // email constants
  const emailSubject = 'Membership application now in deliberation: ' + applicantName;
  const appLink = CONFIG.webAppURL + `?token=${row}`;
  const plainBodyText1 = 
`A membership application for ${applicantName} has been rejected by a voting committee member. All votes have been cancelled and a revote will now commence. Please discuss the application with the other voting committee members.

Applicant: ${applicantName}
Email    : ${applicantEmail}
Submitted: ${formattedTimestamp}

Rejector : ${rejectedBy}
Reason   : ${reason}

`;
  const plainBodyText2 = 
`Review the application details here:
${appLink}

Best regards,
Your Admin AutoBot`;

  const htmlBodyText1 = 
`<p>The application for <b>${applicantName}</b> has been rejected by a voting committee member. All votes have been cancelled and a revote will now commence.</p>
<p>Please discuss the application with the other voting committee members.</p>

<ul>
<li>Applicant: ${applicantName}</li>
<li>Email    : ${applicantEmail}</li>
<li>Submitted: ${formattedTimestamp}</li>
</ul>

<p>Rejector  : ${rejectedBy}</p>
<p>Reason    : ${reason}</p>

<p><b>Please cast your vote using the secure link below:</b></p>
`;

  const htmlBodyText2 =
`<p>You can review the application details here:<br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">view application in your browser</span></a></p>

<p>Best regards,<br>Your Admin AutoBot</p>`;  


  if (allCommitteeEmails.length > 0) {
    allCommitteeEmails.forEach((committeeEmail, index) => {
      const committeeName = committeeNames[index];
      const type = 'vote';
      const token = generateToken(type, committeeName, applicantName, rowId, expiry);
   
      // 1. Save Token to Lock Sheet
      lockSheet.appendRow([token, type, committeeName, rowId, false, expiry]); // Token, Row Index, Used, Expiry
      var urltoken = encodeURIComponent(token); 
      
      // 2. Create Vote URL
      const voteUrl = `${CONFIG.webAppURL}?token=${urltoken}&member=${encodeURIComponent(committeeEmail)}&applicant=${encodeURIComponent(applicantName)}`;
      
      const plainTextBody = `Dear ${committeeName},
${plainBodyText1} 

Please click the secure link below to cast your vote (Approved or Rejected with reason):
${voteUrl}

${plainBodyText2}`;

      const htmlBody = `<p>Dear ${committeeName},</p>
      
      ${htmlBodyText1}
<p><a href="${voteUrl}" target="_blank" style="text-decoration: none; background-color: #4CAF50; color: white; padding: 10px 20px; text-align: center; display: inline-block; border-radius: 5px;">
<span style="font-size: 16px; vertical-align:middle;">Cast Your Vote Now</span>
</a></p>

${htmlBodyText2}`;

      // send email
      MailApp.sendEmail({to: committeeEmail, subject: emailSubject, body: plainTextBody, htmlBody: htmlBody});
      addProcessNote(sheet, row, `Approval re-vote request sent to: ${committeeEmail} at: ${formattedTimestamp}`);
      console.log(`Sent re-vote request to ${committeeEmail} for application ${applicantName}`);
    });
  }
  
}


function getNominatorEmails(nominator) {
  const memberSpreadsheet = SpreadsheetApp.openById(CONFIG.masterDataID);
  const membersSheet = memberSpreadsheet.getSheetByName("Members");
  const lastRow = membersSheet.getLastRow();
  const data = membersSheet.getRange(2, 3, lastRow - 1, 7).getValues();
  for (let i = 0; i < data.length; i++) {
    const name = data[i][0];
    const email = data[i][6];
    if (name && name.toString().trim().toLowerCase() === nominator.trim().toLowerCase()) return email;
  }
  return "Not found";
}