/**
 * Appends round results to Overall Results sheet and triggers series-level discard recalculation
 * using the configured discardsRule from RacingFormat.
 */
function appendRound_v2(overallSheetId, parsed, rankedScores, racingFormat, isDryRun = false) {
  if (isDryRun) {
    Logger.log('[DRY-RUN] Skipping appendRound_v2 to Google Sheets.');
    return;
  }

  const ss = SpreadsheetApp.openById(overallSheetId);
  const sh = ss.getSheetByName('Overall Results');
  const lastCol = sh.getLastColumn();
  const nextCol = Math.max(8, lastCol + 1);

  // Update Metadata
  // DNC points: low-point = boats + 1; high-point (incl. participation series) = 0
  sh.getRange(OVERALL_META_ROW_1, nextCol).setValue(isHighPoint_v2(racingFormat.scoringSystem) ? 0 : parsed.competitorCount + 1);
  sh.getRange(OVERALL_META_ROW_2, nextCol).setValue(parsed.date);
  sh.getRange(OVERALL_HEADER_ROW, nextCol).setValue(`Round ${sh.getRange(OVERALL_META_ROW_2, 4).getValue() + 1}`);

  // Map scores by member name
  const scoreMap = {};
  rankedScores.forEach(r => {
    scoreMap[normalizeName(r.member)] = r.net;
  });

  const lastRow = sh.getLastRow();
  const names = sh.getRange(OVERALL_DATA_START_ROW, 4, lastRow - OVERALL_DATA_START_ROW + 1, 1).getValues().flat();
  const colValues = names.map(name => {
    const key = normalizeName(name);
    return [key in scoreMap ? scoreMap[key] : sh.getRange(OVERALL_META_ROW_1, nextCol).getValue()];
  });

  sh.getRange(OVERALL_DATA_START_ROW, nextCol, colValues.length, 1).setValues(colValues);

  // Recalculate Series Totals with dynamic discardsRule
  recalcSeriesTotals_v2(sh, racingFormat);
}

function recalcSeriesTotals_v2(sh, racingFormat) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastCol < 8) return;

  const totalRounds = lastCol - 7;
  const discardCount = getDiscardCount_v2(totalRounds, racingFormat.discardsRule);
  const scoringSystem = normScoring_v2(racingFormat.scoringSystem);

  const dataRange = sh.getRange(OVERALL_DATA_START_ROW, 8, lastRow - OVERALL_DATA_START_ROW + 1, totalRounds);
  const rows = dataRange.getValues();

  const summary = rows.map(roundScores => {
    const validScores = roundScores.filter(s => typeof s === 'number');
    const { gross, net, discardSum } = calculateNetWithDiscards_v2(validScores, discardCount, scoringSystem);
    return [net, discardSum];
  });

  // Write Total (Col 6 / F) and Discard (Col 7 / G)
  sh.getRange(OVERALL_DATA_START_ROW, 6, summary.length, 2).setValues(summary);
}

/**
 * Appends Round handicap adjustments to Handicaps sheet.
 * Fully skipped if the format has no handicap races.
 */
function appendHCRound_v2(overallSheetId, parsed, updatedHandicaps, racingFormat, isDryRun = false) {
  const hasHandicap = (racingFormat.raceSpecs || []).some(s => s.raceType === 'handicap');
  if (!hasHandicap) {
    Logger.log("Skipping appendHCRound_v2: RacingFormat has zero handicap races.");
    return;
  }

  if (isDryRun) {
    Logger.log('[DRY-RUN] Skipping appendHCRound_v2 to Google Sheets.');
    return;
  }

  const ss = SpreadsheetApp.openById(overallSheetId);
  const hs = ss.getSheetByName('Handicaps');
  if (!hs) return;

  const nextCol = Math.max(8, hs.getLastColumn() + 1);
  hs.getRange(OVERALL_META_ROW_2, nextCol).setValue(parsed.date);
  hs.getRange(OVERALL_HEADER_ROW, nextCol).setValue(`R${hs.getRange(OVERALL_META_ROW_2, 4).getValue() + 1}`);

  const adjMap = {};
  updatedHandicaps.forEach(h => {
    adjMap[normalizeName(h.member)] = h.adj;
  });

  const lastRow = hs.getLastRow();
  const names = hs.getRange(OVERALL_DATA_START_ROW, 4, lastRow - OVERALL_DATA_START_ROW + 1, 1).getValues().flat();
  const adjValues = names.map(name => {
    const key = normalizeName(name);
    return [key in adjMap ? adjMap[key] : '-'];
  });

  hs.getRange(OVERALL_DATA_START_ROW, nextCol, adjValues.length, 1).setValues(adjValues);
}