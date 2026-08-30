function renderNominationForm(tokenInfo) {
  console.log("In render nomination form");
  // 1. Create the template from the file
  var template = HtmlService.createTemplateFromFile('NominatingForm'); 

  // 2. MAP THE DATA
  // In the token: 'param' Applicant's Name
  // In the token: 'email' Committee Member's Name (or email)
  
  template.applicantName = tokenInfo.applicantName;   
  template.committeeMember = tokenInfo.committeeMember;
  template.applicantRowID = tokenInfo.applicantRowID; 
  template.token = tokenInfo.tokenString;
  
  // Get committee members name from token sheet
  const result = validateToken(template.token);
  template.committeeMember = result.cName;
 
 console.log("Committee name: " + template.committeeMember)

  // 3. Return the evaluated HTML
  return template.evaluate()
      .setTitle('SMMC Membership Nomination')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleNomination(params) {
  console.log("In handleNominations - decision: " + params.agree + " comments: " + params.comments);

  // 1. Security Check: Validate Token
  const result = validateToken(params.token);

  if (!result.valid) {
    return `Error: This voting link is already used or invalid - ${result.reason}`;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);

  const role = (result.type === 'Nominating') ? 'Nominator' : 'Seconder';
  const rowId = result.rowId;
  const member = result.cName;
  const row = result.row;
  const agree = (params.agree || '').toLowerCase();
  const comments = params.comments || '';

  console.log('role: ' + role + ' member: ' + member);

  const tsColumnIndex = (result.type === 'Nominating') ? CONFIG.colNominationDate : CONFIG.colSeconderDate;  

  if (!rowId || !member || !agree || !row || !result.type) {
    return 'Missing parameters - require rowId, member, vote and row';
  }
  console.log("agree: " + agree + " member: " + member + " rowId: " + rowId + " row: " + row + " type: " + result.type);

  // ----------------------------------------------------------------------
  // Update timestamp in Column P or Q
  // ----------------------------------------------------------------------
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  sheet.getRange(row, tsColumnIndex).setValue(myDateTime);

  // ----------------------------------------------------------------------
  // Update Comments
  // ----------------------------------------------------------------------
  const commentsCell = sheet.getRange(row, CONFIG.colComments);
  const existingRich = commentsCell.getRichTextValue();

  // Build formatted comment line
  // Role in **bold** is done using RichText formatting

  const newLine = `${role}: ${comments}`;

  let combinedText = '';
  if (existingRich) {
    combinedText = existingRich.getText() + '\n' + newLine;
  } else {
    combinedText = newLine;
  }

  const builder = SpreadsheetApp
    .newRichTextValue()
    .setText(combinedText);

  const roleRegex = /(Nominator|Seconder):/g;
  let match;

  while ((match = roleRegex.exec(combinedText)) !== null) {
    const start = match.index;
    const end = start + match[0].length - 1; // inclusive
    builder.setTextStyle(start, end, SpreadsheetApp.newTextStyle().setBold(true).build());

  }
  commentsCell.setRichTextValue(builder.build());
  // ----------------------------------------------------------------------

  if (agree === 'yes') {
    addProcessNote(sheet, row, `Nomination agreed to by ${member}, comments added.`);
  } else {
    addProcessNote(sheet, row, `${member} disagreed to support the nomination, comments added.`);
  }
  
  // --- CALL THE NECESSARY PROCESSING LOGIC HERE ---
  console.log("Update Nomination Sheet");
  const status = updateNominationStatus(sheet, row);

  // 1. Check for final approval if the comments edit might finalize a row
  if (status === 'Awaiting Approval') {
      console.log('check For Final Approval');
      checkForFinalApproval(sheet, row); 
  }

  // Update Reminder Date
  updateReminderDate(row);

  return `Thank you, ${member}. Your decision, Support the nomination - '${agree}', has been recorded.`;
}