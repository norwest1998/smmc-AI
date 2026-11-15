/**
 * appendRound_v4.js — writes a round into the series' Overall Results (and Handicaps) sheets.
 * v4 rules:
 *  - round columns are located by their 'Round N' header; a new round is inserted at its (date, round) position,
 *    a correction overwrites its own column. Columns are dense: width = 7 + D4.
 *  - D4 (Rounds) = number of 'Round N' columns (rounds sailed, drives discards). Recomputed, never incremented.
 *  - D3 (Last Race) = latest round date.
 *  - dates are real Date values formatted dd/MM/yyyy.
 *  - A9 requests are matched through the Round Tracker (eventID -> series, season, round) and the column by header.
 *
 * Reused unchanged from appendRound_v3.js (keep that file): calculateAVGScore_v3, rankOverall_v3.
 */

/** Column for a round: its own 'Round N' header, else a new column inserted in (date, round) order. */
function roundColumn_v4(sh, roundNo, date) {
  const n = Math.max(sh.getLastColumn() - 7, 0);
  const hdr = n ? sh.getRange(OVERALL_HEADER_ROW, 8, 1, n).getValues()[0] : [];
  const dates = n ? sh.getRange(OVERALL_META_ROW_2, 8, 1, n).getValues()[0] : [];
  const nums = hdr.map(h => { const m = /^Round (\d+)$/.exec(String(h).trim()); return m ? Number(m[1]) : null; });
  const at = nums.indexOf(roundNo);
  if (at > -1) return 8 + at;                                               // correction: same column

  let pos = nums.reduce((p, x, i) => x !== null ? i + 1 : p, 0);            // default: after the last round
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === null) continue;
    const d = toDate_v4(dates[i]);
    if (d > date || (d.getTime() === date.getTime() && nums[i] > roundNo)) { pos = i; break; }
  }
  const col = 8 + pos;
  if (pos < nums.length && nums[pos] !== null) sh.insertColumnBefore(col);
  else if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
  return col;
}

/** D4 = number of 'Round N' columns; D3 = latest round date. Never incremented. */
function syncRoundMeta_v4(sh) {
  const n = sh.getLastColumn() - 7;
  if (n < 1) return;
  const hdr = sh.getRange(OVERALL_HEADER_ROW, 8, 1, n).getValues()[0];
  const dates = sh.getRange(OVERALL_META_ROW_2, 8, 1, n).getValues()[0];
  let cnt = 0, max = null;
  hdr.forEach((h, i) => {
    if (/^Round \d+$/.test(String(h).trim())) { cnt++; const d = toDate_v4(dates[i]); if (!max || d > max) max = d; }
  });
  sh.getRange(OVERALL_META_ROW_2, 4).setValue(cnt);
  sh.getRange(OVERALL_META_ROW_1, 4).setValue(max).setNumberFormat(DATE_FMT_V4);
}

function appendRound_v4(overallSheetId, parsed, rankedScores, series) {
  const roundNumber = Number(parsed.roundNo);
  if (!(roundNumber > 0) || !rankedScores || !rankedScores.length) return;

  const fmt = series.resolvedFormat, high = isHighPoint_v3(fmt.scoringSystem);
  const sh = SpreadsheetApp.openById(overallSheetId).getSheetByName('Overall Results');
  const lastRow = sh.getLastRow();
  if (lastRow < OVERALL_DATA_START_ROW) return;
  const n = lastRow - OVERALL_DATA_START_ROW + 1;

  const colIdx = roundColumn_v4(sh, roundNumber, parsed.dateObj);

  // DNC
  const raceCount = rankedScores[0].racescore.length;
  const sumWeights = expandRaceSpecs_v2(fmt.raceSpecs || [], raceCount).reduce((a, s) => a + (s.weight || 1), 0);
  const dnc = high ? 0 : ((Number(parsed.competitorCount) || 0) + 1) * sumWeights;

  // This round's column
  const ids = sh.getRange(OVERALL_DATA_START_ROW, 3, n, 2).getValues();        // [sail, member]
  const scoreByKey = {};
  rankedScores.forEach(r => { scoreByKey[entryKey_v3(series.entryType, r.member, r.sail)] = r.net; });
  const colValues = ids.map(([sail, member]) => {
    const k = entryKey_v3(series.entryType, member, sail);
    return [k in scoreByKey ? scoreByKey[k] : dnc];
  });

  sh.getRange(OVERALL_META_ROW_1, colIdx).setValue(dnc);
  sh.getRange(OVERALL_META_ROW_2, colIdx).setValue(parsed.dateObj).setNumberFormat(DATE_FMT_V4);
  sh.getRange(OVERALL_HEADER_ROW, colIdx).setValue('Round ' + roundNumber);
  sh.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setValues(colValues);
  // a corrected round starts from raw scores again: drop any earlier A9 flag in this column
  sh.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setNotes(colValues.map(() => ['']));
  sh.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setBackground(null);

  syncRoundMeta_v4(sh);
  recalculateOverall_v4(sh, series);
  Logger.log(`Series '${series.name}': Round ${roundNumber} written (col ${colIdx}), DNC=${dnc}`);
}

/**
 * Recalculates attendance, totals, discards and rank for the whole Overall Results sheet, applying approved
 * RRS A9 average-score requests. Called after every round, and on demand by recalcSeriesOverall_v4().
 * roundCount = D4 = number of round columns.
 */
function recalculateOverall_v4(sh, series) {
  const fmt = series.resolvedFormat, high = isHighPoint_v3(fmt.scoringSystem);
  const lastRow = sh.getLastRow();
  if (lastRow < OVERALL_DATA_START_ROW) return;
  const n = lastRow - OVERALL_DATA_START_ROW + 1;
  const roundCount = Number(sh.getRange(OVERALL_META_ROW_2, 4).getValue()) || 0;
  if (roundCount < 1) return;

  const ids = sh.getRange(OVERALL_DATA_START_ROW, 3, n, 2).getValues();                    // [sail, member]
  const dncValues = sh.getRange(OVERALL_META_ROW_1, 8, 1, roundCount).getValues()[0];
  const roundNos = sh.getRange(OVERALL_HEADER_ROW, 8, 1, roundCount).getValues()[0]
    .map(h => Number(String(h).replace(/\D/g, '')));                                       // round number of each column
  const gridRange = sh.getRange(OVERALL_DATA_START_ROW, 8, n, roundCount);
  const rawGrid = gridRange.getValues();
  const notes = gridRange.getNotes();
  const discards = getDiscardCount_v3(roundCount, fmt.discardsRule);

  // 1. Undo earlier A9 substitutions (the note keeps the original score) so averages always come from real scores
  const wasAvg = notes.map(r => r.map(t => /^A9 average/.test(String(t))));
  const base = rawGrid.map((row, i) => row.map((v, j) => {
    if (!wasAvg[i][j]) return v;
    const m = String(notes[i][j]).match(/was\s+(-?[\d.]+)/);
    return m ? Number(m[1]) : dncValues[j];
  }));

  // 2. Apply every approved average-score request, then show the result in the sheet
  const avg = applyAVGMarkers_v4(base, dncValues, discards, ids, series, roundNos);
  const grid = avg.grid;
  gridRange.setValues(grid);
  gridRange.setNotes(grid.map((row, i) => row.map((v, j) =>
    avg.changed[i][j] ? `A9 average (was ${base[i][j]})` : (wasAvg[i][j] ? '' : notes[i][j]))));
  grid.forEach((row, i) => row.forEach((v, j) => {
    if (avg.changed[i][j] || wasAvg[i][j])
      sh.getRange(OVERALL_DATA_START_ROW + i, 8 + j).setBackground(avg.changed[i][j] ? '#FFF2CC' : null);
  }));

  const results = grid.map(row => {
    let att = 0; const valid = [];
    row.forEach((s, i) => {
      if (typeof s !== 'number') return;
      if (high ? s > dncValues[i] : s < dncValues[i]) att++;
      valid.push(s);
    });
    const { net, discardSum } = calculateNetWithDiscards_v3(valid, discards, fmt.scoringSystem);
    return { att, net, discardSum, rounds: row.filter(s => typeof s === 'number') };
  });

  sh.getRange(OVERALL_DATA_START_ROW, 2, n, 1).setValues(results.map(r => [r.att]));
  sh.getRange(OVERALL_DATA_START_ROW, 6, n, 2).setValues(results.map(r => [r.net, r.discardSum]));

  const ranks = rankOverall_v3(results, high);
  sh.getRange(OVERALL_DATA_START_ROW, 5, n, 1).setValues(ranks.map(r => [r]));
  sh.getRange(OVERALL_DATA_START_ROW, 2, n, sh.getLastColumn() - 1).sort({ column: 5, ascending: true });
  Logger.log(`Overall recalculated for '${series.name}': ${n} rows, ${roundCount} round(s), discards=${discards}`);
}

/** Approved average-score requests (all series/seasons; the caller filters through the Round Tracker). */
function getApprovedAVGRequests_v4() {
  const ss = SpreadsheetApp.openById(getConfig().masterDataSpreadsheetId);
  return sheetToObjects(ss, 'AVGRequests', ['regattaName', 'eventID', 'memberName', 'boatID', 'status'])
    .filter(r => String(r.status).trim().toUpperCase() === 'APPROVED');
}

/**
 * Replaces a round's score with the RRS A9 average for members with an approved request.
 * A request applies only if its event is registered in the Round Tracker for THIS series and the CURRENT season;
 * the column is found by round number via the 'Round N' headers (roundNos).
 * Returns { grid, changed }.
 */
function applyAVGMarkers_v4(grid, dncValues, discards, ids, series, roundNos) {
  const out = grid.map(r => [...r]);
  const changed = grid.map(r => r.map(() => false));

  let reqs;
  try { reqs = getApprovedAVGRequests_v4() || []; }
  catch (e) { Logger.log('A9: could not read average-score requests - ' + e.message); return { grid: out, changed }; }
  Logger.log(`A9: ${reqs.length} approved average-score request(s) found; checking series '${series.name}'`);
  if (!reqs.length) return { grid: out, changed };

  const pick = (r, names) => { for (const k of names) if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return r[k]; return ''; };
  const season = entriesSeason_v3(), infoCache = {};
  const infoOf = id => infoCache[id] || (infoCache[id] = getRoundInfo_v4(id) || {});   // throws if the tracker is unreachable

  const wanted = [];
  reqs.forEach(r => {
    const req = {
      member: pick(r, ['memberName', 'MemberName', 'member', 'Member', 'name']),
      eventID: pick(r, ['eventID', 'eventId', 'EventID', 'hexKey', 'HexKey']),
      sail: pick(r, ['sailNo', 'sail', 'SailNo'])
    };
    if (!req.eventID) return;
    const info = infoOf(req.eventID);
    if (!info.roundNumber) { Logger.log(`A9: event ${req.eventID} (${req.member}) not processed yet`); return; }
    if (String(info.seriesId).trim().toLowerCase() !== series.id.toLowerCase()) return;   // another series
    if (String(info.season).trim() !== season) return;                                    // another season
    req.roundNumber = Number(info.roundNumber);
    wanted.push(req);
  });
  Logger.log(`A9: ${wanted.length} request(s) apply to this series`);

  wanted.forEach(req => {
    const idx = roundNos.indexOf(req.roundNumber);
    if (idx < 0) { Logger.log(`A9: round ${req.roundNumber} not in this workbook (${req.member})`); return; }
    let matched = 0;
    ids.forEach(([sail, member], i) => {
      if (normalizeName(member) !== normalizeName(req.member)) return;
      if (String(series.entryType) === 'boat' && req.sail && String(req.sail).trim() !== String(sail).trim()) return;
      out[i][idx] = calculateAVGScore_v3(grid[i], dncValues, idx, discards, series.resolvedFormat.scoringSystem);
      changed[i][idx] = true;
      matched++;
      Logger.log(`A9 applied: ${member} Round ${req.roundNumber} = ${out[i][idx]} (was ${grid[i][idx]})`);
    });
    if (!matched) Logger.log(`A9: no row for '${req.member}' in this series' Overall sheet (event ${req.eventID})`);
  });

  return { grid: out, changed };
}

/** Run from the editor (or after approving an AVG request) to recalculate a series' Overall Results. */
function recalcSeriesOverall_v4(seriesId) {
  const md = getMasterData_v3();
  const series = md.seriesById[String(seriesId).trim().toLowerCase()];
  if (!series) throw new Error('Unknown series: ' + seriesId);
  const bookId = getSeriesSheetId_v4(series.id);
  if (!bookId) throw new Error('No SpreadsheetID for ' + series.id);
  recalculateOverall_v4(SpreadsheetApp.openById(bookId).getSheetByName('Overall Results'), series);
}

/**
 * Handicap adjustments for the round -> Handicaps sheet. Runs only when Series.HandicapTracking = 'Series'
 * and the format has handicap races. Same column / D3 / D4 rules as the Overall sheet.
 */
function appendHCRound_v4(overallSheetId, parsed, updatedHandicaps, series) {
  if (!hasHandicapSheet_v3(series)) {
    Logger.log(`Skipping handicap tracking for '${series.name}' (HandicapTracking='${series.handicapTracking}').`);
    return;
  }
  const roundNumber = Number(parsed.roundNo);
  const hs = SpreadsheetApp.openById(overallSheetId).getSheetByName('Handicaps');
  if (!hs || !(roundNumber > 0)) return;
  const lastRow = hs.getLastRow();
  if (lastRow < OVERALL_DATA_START_ROW) return;
  const n = lastRow - OVERALL_DATA_START_ROW + 1;

  const colIdx = roundColumn_v4(hs, roundNumber, parsed.dateObj);

  const adjByKey = {};
  updatedHandicaps.forEach(h => { adjByKey[entryKey_v3(series.entryType, h.member, h.sail)] = h.adj; });
  const ids = hs.getRange(OVERALL_DATA_START_ROW, 3, n, 2).getValues();         // [sail, member]
  const colValues = ids.map(([sail, member]) => {
    const k = entryKey_v3(series.entryType, member, sail);
    return [k in adjByKey ? adjByKey[k] : '-'];
  });

  hs.getRange(OVERALL_META_ROW_2, colIdx).setValue(parsed.dateObj).setNumberFormat(DATE_FMT_V4);
  hs.getRange(OVERALL_HEADER_ROW, colIdx).setValue('Round ' + roundNumber);
  hs.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setValues(colValues);

  syncRoundMeta_v4(hs);
  const roundCount = Number(hs.getRange(OVERALL_META_ROW_2, 4).getValue()) || 0;

  // Att (col 2), Adj total (col 6), Current Hcap (col 7) = max(0, starting + adj)
  const grid = hs.getRange(OVERALL_DATA_START_ROW, 8, n, roundCount).getValues();
  const starts = hs.getRange(OVERALL_DATA_START_ROW, 5, n, 1).getValues();
  const att = [], tot = [], cur = [];
  grid.forEach((row, i) => {
    const nums = row.filter(v => typeof v === 'number');
    const adj = nums.reduce((a, b) => a + b, 0);
    att.push([nums.length]); tot.push([adj]);
    cur.push([typeof starts[i][0] === 'number' ? Math.max(0, starts[i][0] + adj) : 0]);
  });
  hs.getRange(OVERALL_DATA_START_ROW, 2, n, 1).setValues(att);
  hs.getRange(OVERALL_DATA_START_ROW, 6, n, 1).setValues(tot);
  hs.getRange(OVERALL_DATA_START_ROW, 7, n, 1).setValues(cur);
  hs.getRange(OVERALL_DATA_START_ROW, 2, n, hs.getLastColumn() - 1).sort({ column: 7, ascending: false });
}