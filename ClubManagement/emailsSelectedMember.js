function processEmailRequest(member) {
  if (!member || !member.id || !member.email) {
    throw new Error("Invalid member details provided.");
  }

  // 1. Generate a clean 32-character unique Hex Code
  const hexCode = generateHexCode();

  // 2. Retrieve your published Web App URL (points to your doGet)
  const webAppUrl = WEB_APP_URL;
  
  if (!webAppUrl) {
    throw new Error("Web App URL not found. Ensure this project is deployed as a Web App.");
  }

  const updateLink = `${webAppUrl}?code=${hexCode}`;

  // 3. Log to Tracking Sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let trackingSheet = ss.getSheetById(TrackingSheetId);

  // Append new pending log entry
  trackingSheet.appendRow([
    hexCode,
    new Date(),
    member.name,
    member.email,
    "Sent"
  ]);

  // 4. Send Email via Google Apps Script MailApp
  const subject = "Action Required: Update Your Member Details";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1a73e8;">Update Your Member Details</h2>
      <p>Hello ${member.name},</p>
      <p>Please take a moment to review and update your current membership information using the button below:</p>
      
      <p style="margin: 25px 0;">
        <a href="${updateLink}" 
           style="background-color: #1a73e8; color: #ffffff; padding: 12px 22px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
           Update Details Now
        </a>
      </p>
      
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${updateLink}">${updateLink}</a>
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: member.email,
    subject: subject,
    htmlBody: htmlBody
  });

  return { status: "success" };
}

function processPaymentReceived(name, email) {
  if (!member || !member.id || !member.email) {
    throw new Error("Invalid member details provided.");
  }

  const hexCode = generateHexCode();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let trackingSheet = ss.getSheetById(TrackingSheetId);
  let expiryDate = ss.getNamedRanges("financialYearEnd");

  const subject = "Payment received: Membership renewed";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1a73e8;">Update Your Member Details</h2>
      <p>Hello ${name},</p>

      <p>Thank you for renewing your membership, your membership has been extended until ${expiryDate}.</p>

      <p>Kind regards.</p>
      <p>Your SMMC Committee</p>
    </div>
  `;

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });

    trackingSheet.appendRow([
      hexCode,
      new Date(),
      name,
      email,
      "Receipt Sent"
    ]);

  } catch (e) {
    Logger.log(`Failed to send to ${email}: ${e.message}`);
  }

  return { status: "success" };
}