function appendRound(bookID, parsed, rankedScores) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName("Overall Results");
  
  const eventID = parsed.eventID;
  const configData = getCurrentRoundInfo(eventID);
  const roundCount = configData.roundNumber; 
  
  let roundColIdx = 5 + roundCount;
  let roundLabel = "Round " + roundCount;

  // 3. Calculate DNC
  const compCount = Number(parsed.competitorCount) || 0;
  // Note: Adjusting to match your rankedScores structure (e.g., using .racescore if it exists)
  const raceCount = rankedScores[0].racescore ? rankedScores[0].racescore.length : 1;
  const dncScore = (compCount + 1) * raceCount;

  // 4. Map Scores to Members (Matching 'member' and returning 'net')
  const lastRow = sh.getLastRow();
  const memberNames = sh.getRange(5, 3, lastRow - 4, 1).getValues().flat();
  
  const scoresToPoint = memberNames.map(sheetName => {
    const cleanSheetName = String(sheetName).trim().toLowerCase();
    
    const match = rankedScores.find(rs => {
      // Matching against 'member' property
      const cleanRankedName = String(rs.member).trim().toLowerCase();
      return cleanRankedName === cleanSheetName;
    });

    if (match) {
      // Returning 'net' property
      return [match.net];
    } else {
      console.log(`No Match: ${sheetName} assigned DNC: ${dncScore}`);
      return [dncScore];
    }
  });

  // 5. Write Data to Overall Results
  sh.getRange(2, roundColIdx).setValue(dncScore);
  sh.getRange(3, roundColIdx).setValue(parsed.date);
  sh.getRange(4, roundColIdx).setValue(roundLabel);
  sh.getRange(5, roundColIdx, scoresToPoint.length, 1).setValues(scoresToPoint);
  
  recalculateOverall(bookID, eventID);
}