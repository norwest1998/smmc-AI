/**
 * appendRound_v3.js — writes a round into the series' Overall Results (and Handicaps) sheets.
 * Differences from v2:
 *  - the round column comes from the round NUMBER (7 + n), so a corrected round overwrites its own column
 *  - DNC for low-point = (boats + 1) x sum of race weights (a round score is a sum of races); 0 for high-point
 *  - Att, Total, Discard and Rank are written, Last Race / Rounds metadata is updated, and the sheet is sorted by rank
 *  - competitors are matched by member (EntryType Member) or by boat (EntryType Boat)
 *  - RRS A9 average-score requests are applied and SHOWN in the sheet (cell value + 'A9 average (was N)' note + highlight)
 */
function appendRound_v3(overallSheetId, parsed, rankedScores, series, roundNumber, isDryRun = false) {
  if (isDryRun) { Logger.log('[DRY-RUN] Skipping appendRound_v3.'); return; }
  if (!(roundNumber > 0) || !rankedScores || !rankedScores.length) return;

  const fmt = series.resolvedFormat, high = isHighPoint_v3(fmt.scoringSystem);
  const sh = SpreadsheetApp.openById(overallSheetId).getSheetByName('Overall Results');
  const lastRow = sh.getLastRow();
  if (lastRow < OVERALL_DATA_START_ROW) return;
  const n = lastRow - OVERALL_DATA_START_ROW + 1;

  const colIdx = 7 + roundNumber;
  if (sh.getMaxColumns() < colIdx) sh.insertColumnsAfter(sh.getMaxColumns(), colIdx - sh.getMaxColumns());

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
  sh.getRange(OVERALL_META_ROW_2, colIdx).setValue(parsed.date);
  sh.getRange(OVERALL_HEADER_ROW, colIdx).setValue('Round ' + roundNumber);
  sh.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setValues(colValues);
  // a corrected round starts from raw scores again: drop any earlier A9 flag in this column
  sh.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setNotes(colValues.map(() => ['']));
  sh.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setBackground(null);

  const roundCount = Math.max(roundNumber, Number(sh.getRange(OVERALL_META_ROW_2, 4).getValue()) || 0);
  sh.getRange(OVERALL_META_ROW_1, 4).setValue(parsed.date);
  sh.getRange(OVERALL_META_ROW_2, 4).setValue(roundCount);

  recalculateOverall_v3(sh, series);
  Logger.log(`Series '${series.name}': Round ${roundNumber} written (col ${colIdx}), DNC=${dnc}`);
}

/**
 * Recalculates attendance, totals, discards and rank for the whole Overall Results sheet, applying approved
 * RRS A9 average-score requests (carried over from v1). Called after every round, and on demand by
 * recalcSeriesOverall_v3() - e.g. after approving an average-score request for an already-processed round.
 */
function recalculateOverall_v3(sh, series) {
  const fmt = series.resolvedFormat, high = isHighPoint_v3(fmt.scoringSystem);
  const lastRow = sh.getLastRow();
  if (lastRow < OVERALL_DATA_START_ROW) return;
  const n = lastRow - OVERALL_DATA_START_ROW + 1;
  const roundCount = Number(sh.getRange(OVERALL_META_ROW_2, 4).getValue()) || 0;
  if (roundCount < 1) return;

  const ids = sh.getRange(OVERALL_DATA_START_ROW, 3, n, 2).getValues();                    // [sail, member]
  const dncValues = sh.getRange(OVERALL_META_ROW_1, 8, 1, roundCount).getValues()[0];
  const gridRange = sh.getRange(OVERALL_DATA_START_ROW, 8, n, roundCount);
  const rawGrid = gridRange.getValues();
  const notes = gridRange.getNotes();
  const discards = getDiscardCount_v3(roundCount, fmt.discardsRule);

  // 1. Undo earlier A9 substitutions (the note keeps the original score: "A9 average (was 20)") so the
  //    averages are always worked out from real scores and re-running never compounds them.
  const wasAvg = notes.map(r => r.map(t => /^A9 average/.test(String(t))));
  let base = rawGrid.map((row, i) => row.map((v, j) => {
    if (!wasAvg[i][j]) return v;
    const m = String(notes[i][j]).match(/was\s+(-?[\d.]+)/);
    return m ? Number(m[1]) : dncValues[j];
  }));

  // 2. Apply every approved average-score request, then show the result in the sheet
  const avg = applyAVGMarkers_v3(base, dncValues, discards, ids, series);
  let grid = avg.grid;
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

/**
 * Replaces a round's score with the RRS A9 average for members with an approved average-score request.
 * getApprovedAVGRequests() -> { memberName, eventID, ... } (field names are matched loosely); the event's round
 * comes from checkRoundExists(eventID). Requests for another series are skipped (by seriesId / seriesName if the
 * request has them, otherwise by the SeriesID on the event's Event Data row).
 * Returns { grid, changed } - changed[i][j] marks substituted cells. Every decision is logged.
 */
function applyAVGMarkers_v3(grid, dncValues, discards, ids, series) {
  const out = grid.map(r => [...r]);
  const changed = grid.map(r => r.map(() => false));

  let reqs;
  try { reqs = getApprovedAVGRequests() || []; }
  catch (e) { Logger.log('A9: could not read average-score requests - ' + e.message); return { grid: out, changed }; }
  Logger.log(`A9: ${reqs.length} approved average-score request(s) found; checking series '${series.name}'`);
  if (!reqs.length) return { grid: out, changed };

  const pick = (r, names) => { for (const k of names) if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return r[k]; return ''; };
  const eventSeries = {};
  const seriesOfEvent = id => (id in eventSeries) ? eventSeries[id] : (eventSeries[id] = String(lookupSeriesIdForEvent_v3(id)).toLowerCase());

  const wanted = [];
  reqs.forEach(r => {
    const req = {
      member: pick(r, ['memberName', 'MemberName', 'member', 'Member', 'name']),
      eventID: pick(r, ['eventID', 'eventId', 'EventID', 'hexKey', 'HexKey']),
      sail: pick(r, ['sailNo', 'sail', 'SailNo']),
      seriesId: String(pick(r, ['seriesId', 'seriesID', 'SeriesID'])).toLowerCase(),
      seriesName: String(pick(r, ['seriesName', 'SeriesName', 'regattaName'])).toLowerCase()
    };
    if (req.seriesId && req.seriesId !== series.id.toLowerCase()) return;
    if (req.seriesName && req.seriesName !== series.name.toLowerCase()) return;
    const evSeries = req.eventID ? seriesOfEvent(req.eventID) : '';
    if (evSeries && evSeries !== series.id.toLowerCase()) return;                 // event belongs to another series
    wanted.push(req);
  });
  Logger.log(`A9: ${wanted.length} request(s) apply to this series`);

  wanted.forEach(req => {
    const roundNumber = checkRoundExists(req.eventID);
    if (!roundNumber) { Logger.log(`A9: no round found yet for event ${req.eventID} (${req.member}) - not processed?`); return; }
    const idx = roundNumber - 1;
    let matched = 0;
    ids.forEach(([sail, member], i) => {
      if (normalizeName(member) !== normalizeName(req.member)) return;
      if (String(series.entryType) === 'boat' && req.sail && String(req.sail).trim() !== String(sail).trim()) return;
      if (idx < 0 || idx >= grid[i].length) return;
      out[i][idx] = calculateAVGScore_v3(grid[i], dncValues, idx, discards, series.resolvedFormat.scoringSystem);
      changed[i][idx] = true;
      matched++;
      Logger.log(`A9 applied: ${member} Round ${roundNumber} = ${out[i][idx]} (was ${grid[i][idx]})`);
    });
    if (!matched) Logger.log(`A9: no row for '${req.member}' in this series' Overall sheet (event ${req.eventID})`);
  });

  return { grid: out, changed };
}

/**
 * Average of the member's other sailed rounds (net of discards / number of rounds), 2 dp - v1's calculateAVGScore.
 * "Sailed" = better than DNC (lower for low-point, higher for high-point). No sailed rounds -> DNC.
 */
function calculateAVGScore_v3(row, dncValues, targetIdx, discards, scoringSystem) {
  const high = isHighPoint_v3(scoringSystem);
  const eligible = [];
  row.forEach((s, i) => {
    if (i === targetIdx || typeof s !== 'number') return;
    if (high ? s > dncValues[i] : s < dncValues[i]) eligible.push(s);
  });
  if (!eligible.length) return Number(dncValues[targetIdx]) || 0;
  const { net } = calculateNetWithDiscards_v3(eligible, discards, scoringSystem);
  return Math.round((net / eligible.length) * 100) / 100;
}

/** Run from the editor (or after approving an AVG request) to recalculate a series' Overall Results. */
function recalcSeriesOverall_v3(seriesId) {
  const md = getMasterData_v3();
  const series = md.seriesById[String(seriesId).trim().toLowerCase()];
  if (!series) throw new Error('Unknown series: ' + seriesId);
  const cfg = getConfig();
  const season = SpreadsheetApp.openById(cfg.masterDataSpreadsheetId).getSheetByName('Variables').getRange('E2').getValue();
  const bookId = getProp(`regattaWorkbookId_Overall Results ${series.name} ${season}`);
  if (!bookId) throw new Error(`No Overall Results workbook yet for '${series.name}' (${season}).`);
  recalculateOverall_v3(SpreadsheetApp.openById(bookId).getSheetByName('Overall Results'), series);
}

/** Rank by net (low-point: lower wins, high-point: higher wins); ties by best round scores, then latest round. */
function rankOverall_v3(results, high) {
  const dir = high ? -1 : 1;
  const cmp = (a, b) => {
    if (a.net !== b.net) return dir * (a.net - b.net);
    const as = [...a.rounds].sort((x, y) => dir * (x - y)), bs = [...b.rounds].sort((x, y) => dir * (x - y));
    for (let i = 0; i < Math.min(as.length, bs.length); i++) if (as[i] !== bs[i]) return dir * (as[i] - bs[i]);
    for (let i = a.rounds.length - 1; i >= 0; i--) if (a.rounds[i] !== b.rounds[i]) return dir * (a.rounds[i] - b.rounds[i]);
    return 0;
  };
  const order = results.map((r, i) => i).sort((i, j) => cmp(results[i], results[j]));
  const ranks = new Array(results.length);
  order.forEach((idx, pos) => {
    ranks[idx] = pos > 0 && cmp(results[order[pos - 1]], results[idx]) === 0 ? ranks[order[pos - 1]] : pos + 1;
  });
  return ranks;
}

/**
 * Handicap adjustments for the round -> Handicaps sheet. Runs only when Series.HandicapTracking = 'Series'
 * and the format has handicap races.
 */
function appendHCRound_v3(overallSheetId, parsed, updatedHandicaps, series, roundNumber, isDryRun = false) {
  if (!hasHandicapSheet_v3(series)) {
    Logger.log(`Skipping handicap tracking for '${series.name}' (HandicapTracking='${series.handicapTracking}').`);
    return;
  }
  if (isDryRun) { Logger.log('[DRY-RUN] Skipping appendHCRound_v3.'); return; }

  const hs = SpreadsheetApp.openById(overallSheetId).getSheetByName('Handicaps');
  if (!hs || !(roundNumber > 0)) return;
  const lastRow = hs.getLastRow();
  if (lastRow < OVERALL_DATA_START_ROW) return;
  const n = lastRow - OVERALL_DATA_START_ROW + 1;

  const colIdx = 7 + roundNumber;
  if (hs.getMaxColumns() < colIdx) hs.insertColumnsAfter(hs.getMaxColumns(), colIdx - hs.getMaxColumns());

  const adjByKey = {};
  updatedHandicaps.forEach(h => { adjByKey[entryKey_v3(series.entryType, h.member, h.sail)] = h.adj; });
  const ids = hs.getRange(OVERALL_DATA_START_ROW, 3, n, 2).getValues();         // [sail, member]
  const colValues = ids.map(([sail, member]) => {
    const k = entryKey_v3(series.entryType, member, sail);
    return [k in adjByKey ? adjByKey[k] : '-'];
  });

  hs.getRange(OVERALL_META_ROW_2, colIdx).setValue(formatDate(parsed.date));
  hs.getRange(OVERALL_HEADER_ROW, colIdx).setValue('Round ' + roundNumber);
  hs.getRange(OVERALL_DATA_START_ROW, colIdx, n, 1).setValues(colValues);

  const roundCount = Math.max(roundNumber, Number(hs.getRange(OVERALL_META_ROW_2, 4).getValue()) || 0);
  hs.getRange(OVERALL_META_ROW_1, 4).setValue(formatDate(parsed.date));
  hs.getRange(OVERALL_META_ROW_2, 4).setValue(roundCount);

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