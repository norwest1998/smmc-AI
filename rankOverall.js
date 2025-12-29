function rankOverall(bookID, eventID) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName("Overall Results");
  const lastRow = sh.getLastRow();

  const configData = getCurrentRoundInfo(eventID);
  const roundCount = configData.roundNumber;

  if (lastRow < 5 || roundCount <= 0) return;

  // 1. Get Data for the Tie-Breaker "scoreMap"
  // Column C: Name, Column E: Net Total, Col G+: Individual Rounds
  const names = sh.getRange(5, 3, lastRow - 4, 1).getValues().flat();
  const netTotals = sh.getRange(5, 5, lastRow - 4, 1).getValues().flat();
  const roundScores = sh.getRange(5, 7, lastRow - 4, roundCount).getValues();

  // 2. Construct the data structure for the tie-breaker
  const scoreMap = names.map((name, i) => {
    return {
      membername: name,
      totalScore: netTotals[i], 
      racescore: roundScores[i].filter(s => typeof s === 'number')
    };
  });

  // 3. Call your existing Tie-Breaker logic
  // This assumes the function you use for Round Results is available
  const rankedScores = rankScoresMap(scoreMap); 

  // 4. Map the calculated ranks back to the spreadsheet rows
  const finalRanks = names.map(name => {
    const match = rankedScores.find(rs => rs.membername === name);
    return [match ? match.rank : ""];
  });

  // 5. Write Ranks (Col D) and Sort the Sheet
  sh.getRange(5, 4, finalRanks.length, 1).setValues(finalRanks);
  const lastCol = sh.getLastColumn();
  sh.getRange(5, 1, lastRow - 4, lastCol).sort({column: 4, ascending: true});
 
  applyOverallFormatting(sh, lastRow - 4);
  console.log("Ranking and Protection applied successfully.");
}