function updatePaidMembers() {
  const htmlOutput = HtmlService.createHtmlOutputFromFile('batchPaid')
    .setWidth(660)
    .setHeight(610);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Update members');

}
/**
 * Retrieves all active members with complete details.
 */
function getMembersForPaidList() {
const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetById(MembersSheetId);
  
  if (!sheet) {
    throw new Error('Sheet named "Members" not found.');
  }

  const data = sheet.getDataRange().getValues();
  const members = [];
  const timeZone = ss.getSpreadsheetTimeZone();

  // Loop starting from row index 1 (skipping headers at index 0)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sheetRowNumber = i + 1; // 1-based row index for Google Sheets

    // Format End Date (Col F / Index 5) - FIX IS HERE
    let endDateStr = '';
    if (row[5] instanceof Date) {
      endDateStr = Utilities.formatDate(row[5], timeZone, 'yyyy-MM-dd');
    } else {
      endDateStr = row[5] ? String(row[5]) : '';
    }

    members.push({
      row: sheetRowNumber,
      id: row[0],             // Col A
      status: row[1],         // Col B
      name: row[2],           // Col C
      membershipType: row[3], // Col D
      endDate: endDateStr,    // Col F (Now a safe string!)
      isPaid: row[6] === true // Col G
    });
  }

  // Sort alphabetically by Name (case-insensitive)
  members.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return members;
}

function updatePaidMembersBatch(memberUpdates) {
  if (!memberUpdates || memberUpdates.length === 0) {
    return 0;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetById(MembersSheetId);
  const financialYearEnd = ss.getRangeByName("financialYearEnd").getValue();

  const fullRange = sheet.getDataRange();
  const data = fullRange.getValues();

  memberUpdates.forEach(update => {
    const arrayIndex = update.row - 1; // Convert 1-based row number to 0-based array index
    if (data[arrayIndex]) {
      if (update.isPaid) {
        data[arrayIndex][1] = true;             // Col B: Status
        data[arrayIndex][5] = financialYearEnd; // Col F: End Date
        data[arrayIndex][6] = true;              // Col G: Paid Up

        // send Thank You email
        const result = processPaymentReceived(data[arrayIndex][2],data[arrayIndex][8]);
        
      } else {
        data[arrayIndex][1] = false;            // Col B: Status
        data[arrayIndex][6] = false;            // Col G: Paid Up
      }
    }
  });

  // Single batch write back to sheet
  fullRange.setValues(data);

  return memberUpdates.length;
}