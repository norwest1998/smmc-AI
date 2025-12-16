function appendRound(bookID, parsed, rankedScores) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName("Overall Results");
  const configSh = ss.getSheetByName("Config");
  
  const eventID = parsed.eventID;
  let roundColIdx = 0;
  let roundLabel = "";

  // 1. Lookup eventID in Config Sheet
  const configData = configSh.getDataRange().getValues();
  for (let i = 1; i < configData.length; i++) {
    if (configData[i][0] === eventID) {
      roundColIdx = configData[i][2];
      roundLabel = configData[i][1];
      break;
    }
  }

  // 2. Register New Round if not found
  if (roundColIdx === 0) {
    const roundCount = configData.length; 
    roundLabel = "Round " + roundCount;
    
    if (configData.length === 1) {
      roundColIdx = 7; // Column G
    } else {
      const lastUsedCol = Math.max(...configData.slice(1).map(row => row[2]));
      roundColIdx = lastUsedCol + 1;
    }
    configSh.appendRow([eventID, roundLabel, roundColIdx]);
  }

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

  // 6. Update Metadata
  sh.getRange("B3").setValue("Rounds : " + (configSh.getLastRow() - 1));
  
  applyOverallFormatting(sh, lastRow - 4);
  recalculateOverall(bookID);
}