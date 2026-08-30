/*************************************
 * Add Round to Overall sheet.
 * ******************************** */ 
function appendRound(bookID, parsed, rankedScores) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName('Overall Results');
  
  const lastRow = sh.getLastRow();
  const roundCount = checkRoundExists(parsed.eventID);
  if (lastRow < 6 || roundCount <= 0) return;

  let roundColIdx = 7 + roundCount;
  let roundLabel = "Round " + roundCount;

  // 3. Calculate DNC
  const compCount = Number(parsed.competitorCount) || 0;
  const raceCount = rankedScores[0].racescore ? rankedScores[0].racescore.length : 1;
  const dncScore = (compCount + 1) * raceCount;

  // 4. Map Scores to Members (Matching 'member' and returning 'net')

  const memberNames = sh.getRange(6, 4, lastRow - 5, 1).getValues().flat();
  
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
      return [dncScore];
    }
  });

  // 5. Write Data to Overall Results
  const expectedLastRow = 5 + scoresToPoint.length;
  if (sh.getMaxRows() < expectedLastRow) {
    sh.insertRowsAfter(sh.getMaxRows(), expectedLastRow - sh.getMaxRows());
  }
  
  sh.getRange(2, roundColIdx).setValue(dncScore);
  sh.getRange(3, roundColIdx).setValue(parsed.date);
  sh.getRange(5, roundColIdx).setValue(roundLabel);
  sh.getRange(6, roundColIdx, scoresToPoint.length, 1).setValues(scoresToPoint);

  sh.getRange("B2").setValue("Last race:");
  sh.getRange("D2").setValue(parsed.date);
  sh.getRange("B3").setValue("Round:");
  sh.getRange("D3").setValue(roundCount);

  // recalculateOverall(bookID, roundCount);
  /********************************************************
   * Recalculate the Overall scores.
   * *************************************************** */  
  const discardNeeded = getDiscardCount(roundCount);
 
  // Load Metadata and Scores
  const dncValues = sh.getRange(2, 8, 1, roundCount).getValues()[0];
  const scoreRange = sh.getRange(6, 8, lastRow - 5, roundCount).getValues();

  const finalCalculations = scoreRange.map(rowScores => {
    let attendanceCount = 0;
    let totalGross = 0;
    let validScores = [];

    rowScores.forEach((score, idx) => {
      if (typeof score === 'number') {
        const dncThreshold = dncValues[idx];
        if (score < dncThreshold) attendanceCount++;
        totalGross += score;
        validScores.push(score);
      }
    });
    
    const sortedScores = [...validScores].sort((a, b) => b - a);
    const discardSum = sortedScores.slice(0, discardNeeded).reduce((a, b) => a + b, 0);
    const netTotal = totalGross - discardSum;

    return {
      attendance: attendanceCount,
      net: netTotal,
      discard: discardSum
    };
  });

  const attendanceData = finalCalculations.map(res => [res.attendance]);
  sh.getRange(6, 2, attendanceData.length, 1).setValues(attendanceData);

  const summaryData = finalCalculations.map(res => [res.net, res.discard]);
  sh.getRange(6, 6, summaryData.length, 2).setValues(summaryData);

  // Sort new scores (assuming headers in row 1)

  const lastCol = sh.getLastColumn();
  
  // Get the data range (exclude header row)
  const dataRange = sh.getRange(6, 2, lastRow - 5, lastCol-1);
  
  const totalColumn = 6; // Total column position
  
  dataRange.sort({
    column: totalColumn,
    ascending: true // Lowest total score = best rank
  });

  // Update Rank column (column E) with new rankings
  const rankRange = sh.getRange(6, 5, lastRow - 5, 1);
  const newRanks = [];
  
  for (let i = 1; i <= lastRow - 5; i++) {
    newRanks.push([i]);
  }
  rankRange.setValues(newRanks);
  console.log("Overall scores recalculated successfully.");

  /*********************************************************
   * Rank the scores now the new round data is calculated in
   * 
   * ******************************************************/ 

  // 1. Get Data for the Tie-Breaker "scoreMap"
  // Column C: Name, Column E: Net Total, Col G+: Individual Rounds
  const names = sh.getRange(6, 4, lastRow - 5, 1).getValues().flat();
  const netTotals = sh.getRange(6, 6, lastRow - 5, 1).getValues().flat();
  const roundScores = sh.getRange(6, 8, lastRow - 5, roundCount).getValues();


  // 2. Construct the data structure for the tie-breaker
  const scoreMap = names.map((name, i) => {
    return {
      membername: name,
      totalScore: netTotals[i], 
      racescore: roundScores[i].filter(s => typeof s === 'number')
    };
  });

  // 3. Call existing Tie-Breaker logic
  // This assumes the function you use for Round Results is available
  const scoresRanked = rankScoresMap(scoreMap); 

  // 4. Map the calculated ranks back to the spreadsheet rows
  const finalRanks = names.map(name => {
    const match = scoresRanked.find(rs => rs.membername === name);
    return [match ? match.rank : ""];
  });

  // 5. Write Ranks (Col D) and Sort the Sheet
  sh.getRange(6, 5, finalRanks.length, 1).setValues(finalRanks);
  sh.getRange(6, 2, lastRow - 5, lastCol).sort({column: 5, ascending: true});
  
  console.log("Ranking and Protection applied successfully.");
}


/*************************************
 * Add Round to Handicaps sheet.
 * ******************************** */ 
function appendHCRound(bookID, parsed, handicaps) {
  const ss = SpreadsheetApp.openById(bookID);
  const hs = ss.getSheetByName('Handicaps');
  const hsLastRow = hs.getLastRow();
  const roundCount = checkRoundExists(parsed.eventID);
  
  if (hsLastRow < 6 || roundCount <= 0) return;
  let roundColIdx = 7 + roundCount;
  let roundLabel = "Round " + roundCount;
    

  const hcapMemberNames = hs.getRange(6, 4, hsLastRow - 5, 1).getValues().flat();
  // Map handicaps to Members (Matching 'member' and returning 'adj')
  const hcapToPoint = hcapMemberNames.map(sheetName => {
    const trimSheetName = String(sheetName).trim().toLowerCase();
    
    const match = handicaps.find(rs => {
      // Matching against 'member' property
      const trimRankedName = String(rs.member).trim().toLowerCase();
      return trimRankedName === trimSheetName;
    });

    if (match) {
      // Returning 'adj' property
      return [match.adj];
    } else {
      return ['-'];
    }
  });

  // 6. Write Data to Handicaps
  hs.getRange(3, roundColIdx).setValue(formatDate(parsed.date));
  hs.getRange(5, roundColIdx).setValue(roundLabel);
  hs.getRange(6, roundColIdx, hcapToPoint.length, 1).setValues(hcapToPoint);

  hs.getRange("B2").setValue("Last race:");
  hs.getRange("D2").setValue(formatDate(parsed.date));
  hs.getRange("B3").setValue("Round:");
  hs.getRange("D3").setValue(roundCount);

  /********************************************************
   * Recalculate the Handicap sheet.
   * *************************************************** */
  // 7. recalculate the Handicaps sheet
  const hcapRange = hs.getRange(6, 8, hsLastRow - 5, roundCount).getValues();

  const finalHandicaps = hcapRange.map(rowScores => {
    let attendanceCount = 0;
    let totaladj = 0;

    rowScores.forEach((hcap, idx) => {
      if (typeof hcap === 'number') {
        attendanceCount++;
        totaladj += hcap;
      } 
    });

    return {
      attendance: attendanceCount,
      adj: totaladj,
    };
  });

  const attendanceHcap = finalHandicaps.map(res => [res.attendance]);
  hs.getRange(6, 2, attendanceHcap.length, 1).setValues(attendanceHcap);

  const summaryHcap = finalHandicaps.map(res => [res.adj]);
  hs.getRange(6, 6, summaryHcap.length, 1).setValues(summaryHcap);

  const curHcapRange = hs.getRange(6,7,hsLastRow - 5,1);
  const curHcaps = [];
  for (let i = 6; i <= hsLastRow; i++) {
    if (typeof hs.getRange(i, 5).getValue() === 'number') {
      currentHcap = Math.max(0, hs.getRange(i, 5).getValue() + hs.getRange(i, 6).getValue());
      curHcaps.push([currentHcap]);
    } else {
      curHcaps.push([0]);
    }
  }
  curHcapRange.setValues(curHcaps);

  // Sort the Handicaps
  const hslastCol = hs.getLastColumn();
  const hcapSort = hs.getRange(6, 2, hsLastRow - 5, hslastCol -1);
  const hcapColumn = 7; // Total column position
  
  hcapSort.sort({ 
    column: hcapColumn,
    ascending: false // Lowest total score = best rank
  });

  console.log(roundLabel + " added to Handicaps to Overall Results sheet");

  console.log("===== Handicap adjustments =====");
  handicaps.forEach(h => {
    console.log(
      JSON.stringify({
        member: h.member,
        boatId: h.boatId,
        hcap: h.hcap,
        adj: h.adj
      })
    );
  });
  updateClassMemberHandicaps(handicaps, parsed.className);
  console.log("Handicaps updated");
}