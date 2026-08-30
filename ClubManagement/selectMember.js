function selectMember() {

  const htmlOutput = HtmlService.createHtmlOutputFromFile('memberSelection')
    .setWidth(480)
    .setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Select Member to Update');

}

function getMembers(option) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetById(MembersSheetId); // Ensure MembersSheetId is defined
  
  if (!sheet) {
    throw new Error('Sheet named "Members" not found.');
  }

  const data = sheet.getDataRange().getValues();
  const members = [];

  // Start from index 1 to skip header row (index 0)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const sheetRowNumber = i + 1; // Sheet rows are 1-indexed (Row 1 = Headers, Row 2 = First Data Row)
    if (option === "full") {
      members.push({
        row: sheetRowNumber, // 1-based row number for Range targeting
        id: row[0],
        name: row[2],
        phone: row[7],
        email: row[8],
        membershiptype: row[3],
        committee: row[18],
        paid: row[6],
        active: row[1]       
      });
    } else {
      if (option === "active") {
        if (row[1] && row[1] === true) {
          members.push({
            row: sheetRowNumber, // 1-based row number for Range targeting
            id: row[0],
            name: row[2],
            phone: row[7],
            email: row[8],
            membershiptype: row[3],
            committee: row[18],
            paid: row[6],
            active: row[1]       
          });
        }
      }
    }
  }

  return members;
}

