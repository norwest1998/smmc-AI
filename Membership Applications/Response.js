// File: Responses.gs (Reworked)

/**
 * Main onEdit trigger function.
 */
function installableOnEdit(e) {
  const sheet = e.source.getActiveSheet();
  const row = e.range.getRow();
  const col = e.range.getColumn();
  
  // Only process data rows (starting from row 8, data start row)
  if (row < CONFIG.dataStartRow) return; 

  // 1. Nomination/Seconder Date Update
  if ([CONFIG.colNominationDate, CONFIG.colSeconderDate].includes(col)) {
    updateNominationStatus(sheet, row);
  } 
  // 2. Committee Vote/Approval Manual Edit (Primarily for Votes For/Against or a direct 'Approved' tick)
  else if (col === CONFIG.colApprovedCheckbox || col === CONFIG.colRejectionReason || col === CONFIG.colVotesFor || col === CONFIG.colVotesAgainst) {
    // Check for final approval if a finalization column is manually edited
    checkForFinalApproval(sheet, row);
  }
}

/**
 * Updates status based on Nominator/Seconder responses.
 */
function updateNominationStatus(sheet, row) {
  console.log("In Nomination update");
  const nominationDate = sheet.getRange(row, CONFIG.colNominationDate).getValue();
  const seconderNominationDate = sheet.getRange(row, CONFIG.colSeconderDate).getValue();
  const status = sheet.getRange(row, CONFIG.colStatus).getValue();
  let newStatus = status;

  console.log('Status: ' + status + " Nom date: " + nominationDate + " sec Date: " + seconderNominationDate);
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

  if (nominationDate && seconderNominationDate && newStatus !== 'Awaiting Approval') {
    newStatus = 'Awaiting Approval';
    addProcessNote(sheet, row, `Status Changed at: ${myDateTime} new status: ${newStatus}`);
    console.log("New Status: Awaiting Approval, going to sendCommitteeApprovalRequest");
    sendCommitteeApprovalRequest(sheet, row); 
  } else if ((nominationDate || seconderNominationDate) && newStatus === 'Received') {
    newStatus = 'In Progress';
    console.log("New Status: In Progress");
    addProcessNote(sheet, row, `Status Changed at: ${myDateTime}, new status: ${newStatus}`);
  }

  if (newStatus !== status) sheet.getRange(row, CONFIG.colStatus).setValue(newStatus);
  
  // Update reminder date regardless of status change
  updateReminderDate(row);
  addProcessNote(sheet, row, `Reminder date updated to: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")} at: ${myDateTime}`)

  return newStatus;
}

function checkForFinalApproval(sheet, row) {
  // Called when Approved checkbox or Rejection reason changes
  const approved = sheet.getRange(row, CONFIG.colApprovedCheckbox).getValue();
  const rejectionReason = sheet.getRange(row, CONFIG.colRejectionReason).getValue();
  const status = sheet.getRange(row, CONFIG.colStatus).getValue();
  const applicantEmail = sheet.getRange(row, CONFIG.colEmail).getValue();
  const membershipType = sheet.getRange(row, CONFIG.colMembershipType).getValue();

  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  if (approved && rejectionReason) {
    // cannot approve when rejection reason exists
    sheet.getRange(row, CONFIG.colApprovedCheckbox).setValue(false);
    SpreadsheetApp.getUi().alert('Approval cannot be granted because there is a rejection reason.');
    // Need to add logic here to cater for change of status --- Awaiting Approval or Attentiopn required...
    return;
  }

  // Primary decision engine: rely on Votes For/Against
  const votesFor = parseList(sheet.getRange(row, CONFIG.colVotesFor).getValue());
  const votesAgainst = parseList(sheet.getRange(row, CONFIG.colVotesAgainst).getValue());
  const committee = getApprovingCommitteeMembers();
  const approverCount = committee.length;

  // If any vote against -> rejected
  if (votesAgainst.length > 0) {
    finalizeDecision(row, 'Rejected', votesAgainst.join(', '));
    sheet.getRange(row, CONFIG.colApprovedCheckbox).setValue(false);
    return;
  }
  // If all committee members have voted for -> approved
  if (votesFor.length === approverCount && approverCount > 0) {
    addProcessNote(sheet, row, `New application votes tallied Approved decision added at ${now.toISOString()}`);
    finalizeDecision(row, 'Approved', 'All committee members voted in favour');
    sheet.getRange(row, CONFIG.colApprovedCheckbox).setValue(true);
    addApprovedMemberToMembersSheet(sheet, row);
    addProcessNote(sheet, row, `New member added at ${now.toISOString()}`);
    return;
  }
  // otherwise, not yet decided. Update status if necessary
  const newStatus = (votesFor.length > 0 || votesAgainst.length > 0) ? 'Awaiting Approval' : status;
  if (newStatus !== status) {
    sheet.getRange(row, CONFIG.colStatus).setValue(newStatus);
    sheet.getRange(row, CONFIG.colStatusUpdated).setValue(myDateTime);
    addProcessNote(sheet, row, `Status changed to ${newStatus} at ${now.toISOString()}`);
  }
}

function finalizeDecision(row, decision, reasonText) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  // set turnaround
  const timestamp = sheet.getRange(row, CONFIG.colTimestamp).getValue();
  if (timestamp) {
    const days = (now - new Date(timestamp)) / (1000*60*60*24);
    sheet.getRange(row, CONFIG.colTurnaroundTime).setValue(days);
  }

  // send email to applicant
  sendFinalApplicantEmail(sheet, row, decision);
  addProcessNote(sheet, row, `${decision} email sent to applicant at ${now.toISOString()}`);

  // Finalise all
  sheet.getRange(row, CONFIG.colStatus).setValue('Processed');
  sheet.getRange(row, CONFIG.colStatusUpdated).setValue(myDateTime);
  addProcessNote(sheet, row, `Application Process completed: ${decision} at ${now.toISOString()} Reason: ${reasonText}`);

  // invalidate outstanding tokens for this row
  invalidateTokensForRow(sheet.getRange(row, CONFIG.colRowID).getValue());
}

function initiateDeliberation(sheet, row) {
  console.log('In deliberation module');
  
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  // get rowID and cancel outstading vote tokens 
  const rowID = sheet.getRange(row,CONFIG.colRowID).getValue();
  invalidateTokensForRow(rowID);

  // send deliberation emails to voting committe members 
  sendDeliberationEmails(sheet, row);
  
  // remove previous votes FOR and AGAINST
  sheet.getRange(row,CONFIG.colVotesFor).setValue(null);
  sheet.getRange(row,CONFIG.colVotesAgainst).setValue(null);

  // update status to 'in deliberation'
  const newStatus = 'In Deliberation';
  sheet.getRange(row,CONFIG.colStatus).setValue(newStatus);
  
  updateReminderDate(row);

  // update process notes
  addProcessNote(sheet, row, `Status changed to ${newStatus} at ${myDateTime}`);
}

