/**
 * seriesEntries_v3.js — handicaps for series with HandicapTracking = 'Series' live in the merged SeriesEntries sheet
 * of the Racing Formats workbook (shared with series registration):
 *   EntryID, SeriesID, MemberID, BoatID, StartingHandicap, CurrentHandicap, SeriesPoints, Status, Season, Timestamp
 * Registration creates the row (Status = Entered); results processing keeps CurrentHandicap up to date and creates the
 * row (Status blank) for a boat that races without having registered. Rows are per season (Season, e.g. 2026-27).
 *
 *   CurrentHandicap = max(0, StartingHandicap + total handicap adjustment over all rounds so far)
 * The adjustment total comes from the series' Handicaps sheet (one column per round), so reprocessing a
 * corrected round never double-counts. The master ClassMembers handicaps are not touched for these series.
 * SeriesPoints is left alone.
 */
function readSeriesEntries_v3() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.racingFormatsSpreadsheetId || RACING_FORMATS_SS_ID_V3);
  const sh = ss.getSheetByName('SeriesEntries');
  if (!sh) throw new Error("Racing Formats workbook: sheet 'SeriesEntries' not found.");
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(x => String(x).trim());
  const idx = n => headers.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const need = ['EntryID', 'SeriesID', 'MemberID', 'BoatID', 'StartingHandicap', 'CurrentHandicap'];
  const missing = need.filter(n => idx(n) < 0);
  if (missing.length) throw new Error('SeriesEntries is missing column(s): ' + missing.join(', '));
  return { sh, values, headers, idx };
}

/** Current sailing season as text, e.g. '2026-27' (master Variables!E2, else derived from today's date). */
function entriesSeason_v3() {
  try {
    const v = SpreadsheetApp.openById(getConfig().masterDataSpreadsheetId).getSheetByName('Variables').getRange('E2').getValue();
    if (v !== '' && v !== null && v !== undefined) return String(v).trim();
  } catch (e) { /* fall through */ }
  const d = new Date(), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '-' + String(y + 1).slice(2);
}
const sameSeason_v3 = (cell, season) => { const c = String(cell).trim(); return c === '' || c === season; };

const hcapNum_v3 = v => (v === '' || v === null || v === undefined || !isFinite(Number(v))) ? null : Number(v);

/** Boats in a tracked series start from their SeriesEntries.StartingHandicap when they have an entry row. */
function overlayStartingHandicaps_v3(series, roster) {
  if (!hasHandicapSheet_v3(series)) return roster;
  let E;
  try { E = readSeriesEntries_v3(); } catch (err) { Logger.log('overlayStartingHandicaps_v3: ' + err.message); return roster; }
  const iS = E.idx('SeriesID'), iB = E.idx('BoatID'), iSt = E.idx('StartingHandicap'), iSea = E.idx('Season');
  const season = entriesSeason_v3();
  const rows = E.values.slice(1).filter(r => String(r[iS]).trim().toLowerCase() === series.id.toLowerCase() &&
                                             (iSea < 0 || sameSeason_v3(r[iSea], season)));
  return roster.map(m => {
    const hit = String(m.boatId || '').trim() !== '' && rows.find(r => String(r[iB]).trim() === String(m.boatId).trim());
    const st = hit ? hcapNum_v3(hit[iSt]) : null;
    return st === null ? m : Object.assign({}, m, { hcap: st });
  });
}

/**
 * Writes StartingHandicap / CurrentHandicap for every boat that raced this round (creating the entry row
 * on a boat's first race). Returns the number of entries touched.
 */
function syncSeriesEntryHandicaps_v3(series, overallSheetId, updatedHandicaps, md) {
  if (!hasHandicapSheet_v3(series)) return 0;

  // Adjustment totals so far, from the series' Handicaps sheet (cols: Att, Sail, Member, Starting, Adj, Current)
  const hs = SpreadsheetApp.openById(overallSheetId).getSheetByName('Handicaps');
  const hsMap = {};
  if (hs && hs.getLastRow() >= OVERALL_DATA_START_ROW) {
    hs.getRange(OVERALL_DATA_START_ROW, 3, hs.getLastRow() - OVERALL_DATA_START_ROW + 1, 5).getValues()
      .forEach(([sail, member, start, adj]) => { hsMap[entryKey_v3(series.entryType, member, sail)] = { start, adj }; });
  }

  const E = readSeriesEntries_v3();
  const iEntry = E.idx('EntryID'), iSeries = E.idx('SeriesID'), iMember = E.idx('MemberID'),
        iBoat = E.idx('BoatID'), iStart = E.idx('StartingHandicap'), iCur = E.idx('CurrentHandicap'),
        iSea = E.idx('Season');
  const season = entriesSeason_v3();
  const body = E.values.slice(1);
  const existingCount = body.length;
  const sid = series.id.toLowerCase();
  let touched = 0;

  updatedHandicaps.forEach(h => {
    const memberId = (md.memberIdByName || {})[normalizeName(h.member)] || '';
    const boatId = String(h.boatId || '').trim();
    const hsr = hsMap[entryKey_v3(series.entryType, h.member, h.sail)];
    const adjTotal = hsr && isFinite(Number(hsr.adj)) ? Number(hsr.adj) : (Number(h.adj) || 0);

    const row = body.find(r => String(r[iSeries]).trim().toLowerCase() === sid &&
      (iSea < 0 || sameSeason_v3(r[iSea], season)) &&                                  // this season's entry (or one with no season yet)
      (boatId ? String(r[iBoat]).trim() === boatId : String(r[iMember]).trim() === String(memberId)));

    let start = row ? hcapNum_v3(row[iStart]) : null;
    if (start === null) start = hcapNum_v3(hsr && hsr.start);
    if (start === null) start = hcapNum_v3(h.hcap);
    if (start === null) start = 0;
    const current = Math.max(0, start + adjTotal);

    if (row) {
      if (hcapNum_v3(row[iStart]) === null) row[iStart] = start;
      row[iCur] = current;
      if (iSea >= 0 && String(row[iSea]).trim() === '') row[iSea] = season;
    } else {
      const nr = new Array(E.headers.length).fill('');
      nr[iEntry] = 'SE-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
      nr[iSeries] = series.id; nr[iMember] = memberId; nr[iBoat] = boatId;
      nr[iStart] = start; nr[iCur] = current;
      if (iSea >= 0) nr[iSea] = season;                       // Status stays blank: raced, but did not register
      body.push(nr);
    }
    touched++;
  });

  if (existingCount > 0) {                                     // only the two handicap columns of existing rows
    E.sh.getRange(2, iStart + 1, existingCount, 1).setValues(body.slice(0, existingCount).map(r => [r[iStart]]));
    E.sh.getRange(2, iCur + 1, existingCount, 1).setValues(body.slice(0, existingCount).map(r => [r[iCur]]));
    if (iSea >= 0) {                                           // fill a blank Season on existing rows (as text, so "2026-27" stays text)
      const seaRange = E.sh.getRange(2, iSea + 1, existingCount, 1);
      seaRange.setNumberFormat('@');
      seaRange.setValues(body.slice(0, existingCount).map(r => [r[iSea]]));
    }
  }
  if (body.length > existingCount) {                           // new entries: whole rows
    const fresh = body.slice(existingCount);
    const block = E.sh.getRange(existingCount + 2, 1, fresh.length, E.headers.length);
    if (iSea >= 0) E.sh.getRange(existingCount + 2, iSea + 1, fresh.length, 1).setNumberFormat('@');
    block.setValues(fresh);
  }
  return touched;
}