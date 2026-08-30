function markPaid(row, isPaidChecked) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetById(MembersSheetId);
      
  // 1. Retrieve financialYearEnd from Named Range
  const financialYearEnd = ss.getRangeByName("financialYearEnd").getValue();

  // 2. Fetch the 1-row, 7-column range
  const range = membersSheet.getRange(row, 1, 1, 7);
  const memberData = range.getValues(); 

  const memberRow = memberData[0];     // Extract the inner 1D array
  const memberName = memberRow[2];     // Column C (Index 2) is Name

  if (memberName) {
    // 3. Modify array values in memory (0-indexed)
    memberRow[1] = true;                             // Column B (Index 1): Status
    memberRow[5] = financialYearEnd;                 // Column F (Index 5): End Date
    memberRow[6] = isPaidChecked !== undefined ? isPaidChecked : true; // Column G (Index 6): Paid Up

    // 4. Batch write all columns back in a SINGLE call
    range.setValues(memberData);

    return `Updated ${memberName}'s membership to Active, Payment Recorded.`;
  } else {
    throw new Error(`Member at row ${row} was not found in the Members list.`);
  }
}
