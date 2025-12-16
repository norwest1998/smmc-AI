function overallWriter(bookID, parsed, members, rankedScores) {
  const ss = SpreadsheetApp.openById(bookID);
  const sheetName = "Overall Results";
  let sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName, 0);
  
  // 1. Metadata & Series Headers
  const lastRaceStr = "Last Race : " + parsed.date;
  sh.getRange("B2:C2").merge().setValue(lastRaceStr);
  sh.getRange("F2").setValue("DNC");

  const countRounds = ss.getSheets().length - 1; 
  sh.getRange("B3:C3").merge().setValue("Rounds : " + countRounds);

  const seriesHeaders = [["Attended", "Sail #", "Member Name", "Rank", "Total", "Discard"]];
  sh.getRange("A4:F4").setValues(seriesHeaders);

  // 2. Populate Members
  const memberData = [];
  if (members && Array.isArray(members)) {
    members.forEach(m => memberData.push(["", m.sailnumber, m.membername, "", "", ""]));
  }

  if (memberData.length > 0) {
    sh.getRange(5, 1, memberData.length, 6).setValues(memberData);
    const lastRow = 4 + memberData.length;
    if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  }

  // 3. Add Round Metadata (Column G)
  const roundColIdx = 7; 
  const compCount = Number(parsed.competitorCount) || 0;
  const raceCount = rankedScores[0].racescore.length;
  const dncScore = (compCount + 1) * raceCount;

  sh.getRange(2, roundColIdx).setValue(dncScore);
  sh.getRange(3, roundColIdx).setValue(parsed.date);
  sh.getRange(4, roundColIdx).setValue(`Round ${countRounds}`);

  // 4. Apply All Formatting
  applyOverallFormatting(sh, memberData.length, roundColIdx);
}

