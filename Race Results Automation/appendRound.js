function appendRound(bookID, parsed, rankedScores) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName('Overall Results');

  const lastRow = sh.getLastRow();
  const roundCount = checkRoundExists(parsed.eventID);
  if (lastRow < OVERALL_DATA_START_ROW || roundCount <= 0) return;

  writeRoundColumn(sh, parsed, rankedScores, roundCount, lastRow);
  recalculateOverallTotals(sh, roundCount, lastRow);
  applyTieBreakRanking(sh, roundCount, lastRow);

  console.log(`Round ${roundCount} appended, recalculated, and ranked for eventID ${parsed.eventID}`);
}

function writeRoundColumn(sh, parsed, rankedScores, roundCount, lastRow) {
  const roundColIdx = 7 + roundCount;
  const roundLabel = "Round " + roundCount;

  const compCount = Number(parsed.competitorCount) || 0;
  const raceCount = rankedScores[0].racescore ? rankedScores[0].racescore.length : 1;
  const dncScore = (compCount + 1) * raceCount;

  const dataRowCount = lastRow - OVERALL_DATA_START_ROW + 1;
  const memberNames = sh.getRange(OVERALL_DATA_START_ROW, 4, dataRowCount, 1).getValues().flat();
  const scoresToPoint = memberNames.map(sheetName => {
    const match = findByName(rankedScores, sheetName, 'member');
    return match ? [match.net] : [dncScore];
  });

  const expectedLastRow = OVERALL_DATA_START_ROW - 1 + scoresToPoint.length;
  if (sh.getMaxRows() < expectedLastRow) {
    sh.insertRowsAfter(sh.getMaxRows(), expectedLastRow - sh.getMaxRows());
  }

  // Guard: ensure sheet has enough COLUMNS before writing
  if (sh.getMaxColumns() < roundColIdx) {
    sh.insertColumnsAfter(sh.getMaxColumns(), roundColIdx - sh.getMaxColumns());
  }

  sh.getRange(OVERALL_META_ROW_1, roundColIdx).setValue(dncScore);
  sh.getRange(OVERALL_META_ROW_2, roundColIdx).setValue(parsed.date);
  sh.getRange(OVERALL_HEADER_ROW, roundColIdx).setValue(roundLabel);
  sh.getRange(OVERALL_DATA_START_ROW, roundColIdx, scoresToPoint.length, 1).setValues(scoresToPoint);

  sh.getRange(OVERALL_META_ROW_1, 2).setValue("Last race:");
  sh.getRange(OVERALL_META_ROW_1, 4).setValue(parsed.date);
  sh.getRange(OVERALL_META_ROW_2, 2).setValue("Round:");
  sh.getRange(OVERALL_META_ROW_2, 4).setValue(roundCount);

  console.log(`Round column written: ${roundLabel} (col ${roundColIdx}), DNC=${dncScore}`);
}

function recalculateOverallTotals(sh, roundCount, lastRow) {
  const discardNeeded = getDiscardCount(roundCount);
  const dataRowCount = lastRow - OVERALL_DATA_START_ROW + 1;

  const dncValues = sh.getRange(OVERALL_META_ROW_1, 8, 1, roundCount).getValues()[0];
  const scoreRange = sh.getRange(OVERALL_DATA_START_ROW, 8, dataRowCount, roundCount).getValues();

  const finalCalculations = scoreRange.map(rowScores => {
    let attendanceCount = 0;
    const validScores = [];

    rowScores.forEach((score, idx) => {
      if (typeof score === 'number') {
        if (score < dncValues[idx]) attendanceCount++;
        validScores.push(score);
      }
    });

    const { net, discardSum } = calculateNetWithDiscards(validScores, discardNeeded);
    return { attendance: attendanceCount, net, discard: discardSum };
  });

  const attendanceData = finalCalculations.map(res => [res.attendance]);
  sh.getRange(OVERALL_DATA_START_ROW, 2, attendanceData.length, 1).setValues(attendanceData);

  const summaryData = finalCalculations.map(res => [res.net, res.discard]);
  sh.getRange(OVERALL_DATA_START_ROW, 6, summaryData.length, 2).setValues(summaryData);

  console.log(`Overall totals recalculated for ${finalCalculations.length} member(s), discardCount=${discardNeeded}`);
}

function applyTieBreakRanking(sh, roundCount, lastRow) {
  const lastCol = sh.getLastColumn();
  const dataRowCount = lastRow - OVERALL_DATA_START_ROW + 1;

  const names = sh.getRange(OVERALL_DATA_START_ROW, 4, dataRowCount, 1).getValues().flat();
  const netTotals = sh.getRange(OVERALL_DATA_START_ROW, 6, dataRowCount, 1).getValues().flat();
  const roundScores = sh.getRange(OVERALL_DATA_START_ROW, 8, dataRowCount, roundCount).getValues();

  const scoreMap = names.map((name, i) => ({
    membername: name,
    totalScore: netTotals[i],
    racescore: roundScores[i].filter(s => typeof s === 'number')
  }));

  const scoresRanked = rankScoresMap(scoreMap);

  const finalRanks = names.map(name => {
    const match = scoresRanked.find(rs => rs.membername === name);
    return [match ? match.rank : ""];
  });

  sh.getRange(OVERALL_DATA_START_ROW, 5, finalRanks.length, 1).setValues(finalRanks);
  sh.getRange(OVERALL_DATA_START_ROW, 2, dataRowCount, lastCol - 1).sort({ column: 5, ascending: true });

  console.log(`Tie-break ranking applied and sheet sorted for ${finalRanks.length} member(s)`);
}


/*************************************
 * Add Round to Handicaps sheet.
 * ******************************** */
function appendHCRound(bookID, parsed, handicaps) {
  const ss = SpreadsheetApp.openById(bookID);
  const hs = ss.getSheetByName('Handicaps');
  const hsLastRow = hs.getLastRow();
  const roundCount = checkRoundExists(parsed.eventID);

  if (hsLastRow < OVERALL_DATA_START_ROW || roundCount <= 0) return;
  const roundColIdx = 7 + roundCount;
  const roundLabel = "Round " + roundCount;
  const dataRowCount = hsLastRow - OVERALL_DATA_START_ROW + 1;

  const hcapMemberNames = hs.getRange(OVERALL_DATA_START_ROW, 4, dataRowCount, 1).getValues().flat();
  const hcapToPoint = hcapMemberNames.map(sheetName => {
    const match = findByName(handicaps, sheetName, 'member');
    return match ? [match.adj] : ['-'];
  });

  // Guard: ensure sheet has enough ROWS before writing
  const expectedLastRow = OVERALL_DATA_START_ROW - 1 + hcapToPoint.length;
  if (hs.getMaxRows() < expectedLastRow) {
    hs.insertRowsAfter(hs.getMaxRows(), expectedLastRow - hs.getMaxRows());
  }

  // Guard: ensure sheet has enough COLUMNS before writing (fixes trim-by-formatting bug)
  if (hs.getMaxColumns() < roundColIdx) {
    hs.insertColumnsAfter(hs.getMaxColumns(), roundColIdx - hs.getMaxColumns());
  }
  clearRoundColumn(hs, roundColIdx, hcapToPoint.length);

  hs.getRange(OVERALL_META_ROW_2, roundColIdx).setValue(formatDate(parsed.date));
  hs.getRange(OVERALL_HEADER_ROW, roundColIdx).setValue(roundLabel);
  hs.getRange(OVERALL_DATA_START_ROW, roundColIdx, hcapToPoint.length, 1).setValues(hcapToPoint);

  hs.getRange(OVERALL_META_ROW_1, 2).setValue("Last race:");
  hs.getRange(OVERALL_META_ROW_1, 4).setValue(formatDate(parsed.date));
  hs.getRange(OVERALL_META_ROW_2, 2).setValue("Round:");
  hs.getRange(OVERALL_META_ROW_2, 4).setValue(roundCount);

  // Recalculate the Handicaps sheet
  const hcapRange = hs.getRange(OVERALL_DATA_START_ROW, 8, hcapToPoint.length, roundCount).getValues();

  const finalHandicaps = hcapRange.map(rowScores => {
    let attendanceCount = 0;
    let totaladj = 0;
    rowScores.forEach(hcap => {
      if (typeof hcap === 'number') {
        attendanceCount++;
        totaladj += hcap;
      }
    });
    return { attendance: attendanceCount, adj: totaladj };
  });

  const attendanceHcap = finalHandicaps.map(res => [res.attendance]);
  hs.getRange(OVERALL_DATA_START_ROW, 2, attendanceHcap.length, 1).setValues(attendanceHcap);

  const summaryHcap = finalHandicaps.map(res => [res.adj]);
  hs.getRange(OVERALL_DATA_START_ROW, 6, summaryHcap.length, 1).setValues(summaryHcap);

  const newLastRow = OVERALL_DATA_START_ROW - 1 + hcapToPoint.length;
  const curHcapRange = hs.getRange(OVERALL_DATA_START_ROW, 7, hcapToPoint.length, 1);
  const curHcaps = [];
  for (let i = OVERALL_DATA_START_ROW; i <= newLastRow; i++) {
    if (typeof hs.getRange(i, 5).getValue() === 'number') {
      const currentHcap = Math.max(0, hs.getRange(i, 5).getValue() + hs.getRange(i, 6).getValue());
      curHcaps.push([currentHcap]);
    } else {
      curHcaps.push([0]);
    }
  }
  curHcapRange.setValues(curHcaps);

  // Sort the Handicaps sheet
  const hslastCol = hs.getLastColumn();
  const hcapSort = hs.getRange(OVERALL_DATA_START_ROW, 2, hcapToPoint.length, hslastCol - 1);
  hcapSort.sort({ column: 7, ascending: false });

  console.log(roundLabel + " added to Handicaps to Overall Results sheet");
  console.log("===== Handicap adjustments =====");
  handicaps.forEach(h => {
    console.log(JSON.stringify({ member: h.member, boatId: h.boatId, hcap: h.hcap, adj: h.adj }));
  });

  updateClassMemberHandicaps(handicaps, parsed.className);
  console.log("Handicaps updated");
}