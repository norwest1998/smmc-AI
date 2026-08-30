/**
 * Processes submission from HTML Membership Application page.
 */
function submitApplication(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.membershipSheetName);

    const rowId = (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toLowerCase();
    const now = new Date();
    const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const reminderDate = new Date(now);
    reminderDate.setDate(reminderDate.getDate() + 2);

    const applicantName = `${formData.firstName} ${formData.surname}`.trim();

    // Construct 1-based indexed row matching sheet schema
    const newRow = [];
    newRow[CONFIG.colRowID - 1] = rowId;
    newRow[CONFIG.colStatus - 1] = 'Received';
    newRow[CONFIG.colTimestamp - 1] = myDateTime;
    newRow[CONFIG.colEmail - 1] = formData.email;
    newRow[CONFIG.colFirstName - 1] = formData.firstName;
    newRow[CONFIG.colSurname - 1] = formData.surname;
    newRow[CONFIG.colAddress - 1] = formData.address;
    newRow[CONFIG.colPCode - 1] = formData.pCode;
    newRow[CONFIG.colPhone - 1] = formData.phone;
    newRow[CONFIG.colEContact - 1] = formData.eContact;
    newRow[CONFIG.colEContactPh - 1] = formData.eContactPh;
    newRow[CONFIG.colMembershipType - 1] = formData.membershipType;
    newRow[CONFIG.colCurrentClub - 1] = formData.currentClub;
    newRow[CONFIG.colNominatorName - 1] = formData.nominator;
    newRow[CONFIG.colSeconderName - 1] = formData.seconder;
    newRow[CONFIG.colDisclaimer - 1] = formData.disclaimer ? 'Yes' : 'No';
    newRow[CONFIG.colCity - 1] = formData.city;
    newRow[CONFIG.colReminderDate - 1] = Utilities.formatDate(reminderDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    newRow[CONFIG.colProcessedNotes - 1] = `Application received via Web Form at: ${myDateTime}\n`;
    newRow[CONFIG.colStatusUpdated - 1] = myDateTime;

    sheet.appendRow(newRow);
    const lastRow = sheet.getLastRow();

    // Generate tokens & dispatch notification emails
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 14);
    const lockSheet = ss.getSheetByName('Tokens');

    // 1. Email to Nominator
    let nominatorEmail = getNominatorEmails(formData.nominator);
    if (nominatorEmail && nominatorEmail !== "Not found") {
      let type = 'Nominating';
      let token = generateToken(type, nominatorEmail, applicantName, rowId, expiry);
      lockSheet.appendRow([token, type, formData.nominator, rowId, false, expiry]);
      let baseURL = CONFIG.webAppURL + '?token=' + encodeURIComponent(token);
      const {plainTextBody: nomPlain, htmlBody: nomHtml} = createNominatorSeconderEmail(type, applicantName, lastRow, formData.email, myDateTime, baseURL);
      addProcessNote(sheet, lastRow, `Nomination eMail sent to nominating member: ${nominatorEmail} at: ${myDateTime}`);
      MailApp.sendEmail({to: nominatorEmail, subject: `Membership nomination for ${applicantName}`, body: nomPlain, htmlBody: nomHtml});
    }

    // 2. Email to Seconder
    let seconderEmail = getNominatorEmails(formData.seconder);
    if (seconderEmail && seconderEmail !== "Not found") {
      let type = 'Seconding';
      let token = generateToken(type, seconderEmail, applicantName, rowId, expiry);
      lockSheet.appendRow([token, type, formData.seconder, rowId, false, expiry]);
      let baseURL = CONFIG.webAppURL + '?token=' + encodeURIComponent(token);
      const {plainTextBody: secPlain, htmlBody: secHtml} = createNominatorSeconderEmail(type, applicantName, lastRow, formData.email, myDateTime, baseURL);
      addProcessNote(sheet, lastRow, `Nomination eMail sent to seconding member: ${seconderEmail} at: ${myDateTime}`);
      MailApp.sendEmail({to: seconderEmail, subject: `Membership seconding for ${applicantName}`, body: secPlain, htmlBody: secHtml});
    }

    return { success: true, message: `Application for ${applicantName} submitted successfully!` };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}
