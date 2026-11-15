const extractSheetId_v4 = s => { const t = String(s == null ? '' : s).trim(), m = t.match(/\/d\/([\w-]+)/); return m ? m[1] : t; };

function seriesSheetCtx_v4() {
  const sh = SpreadsheetApp.openById(getConfig().racingFormatsSpreadsheetId || RACING_FORMATS_SS_ID_V3).getSheetByName('Series');
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim().toLowerCase());
  return { sh, v, iId: h.indexOf('id'), iSs: h.indexOf('spreadsheetid') };
}
const seriesRowIdx_v4 = (c, id) => c.v.findIndex((r, i) => i > 0 && String(r[c.iId]).trim().toLowerCase() === String(id).toLowerCase());

function getSeriesSheetId_v4(seriesId) {
  const c = seriesSheetCtx_v4(), r = seriesRowIdx_v4(c, seriesId);
  if (r < 0 || c.iSs < 0) throw new Error(`Series sheet: row '${seriesId}' or column SpreadsheetID not found`);
  return extractSheetId_v4(c.v[r][c.iSs]);
}
function saveSeriesSheetId_v4(seriesId, id) {          // single-cell write; refuses to overwrite
  const c = seriesSheetCtx_v4(), r = seriesRowIdx_v4(c, seriesId);
  if (r < 0 || c.iSs < 0) throw new Error(`Series sheet: row '${seriesId}' or column SpreadsheetID not found`);
  const cell = c.sh.getRange(r + 1, c.iSs + 1);
  if (String(cell.getValue()).trim() !== '') throw new Error(`SpreadsheetID for ${seriesId} was filled by another process`);
  cell.setValue(id);
}
function workbookValid_v4(id, series, season) {        // '' = valid, else the reason
  try {
    if (DriveApp.getFileById(id).isTrashed()) return 'file is in the trash';
    const ss = SpreadsheetApp.openById(id);
    if (!ss.getSheetByName('Overall Results')) return "no 'Overall Results' sheet";
    if (hasHandicapSheet_v3(series) && !ss.getSheetByName('Handicaps')) return "no 'Handicaps' sheet";
    if (!ss.getName().endsWith(' ' + season)) return `not a ${season} workbook ("${ss.getName()}")`;
    return '';
  } catch (e) { return 'cannot open: ' + e.message; }
}

/** Season cutover: run ONLY after the season's results are final and backed up. */
function seasonCutover_v4() {
  const c = seriesSheetCtx_v4();
  if (c.iSs < 0) throw new Error('SpreadsheetID column not found');
  c.v.slice(1).forEach(r => { if (r[c.iSs]) Logger.log(`Clearing ${r[c.iId]}: ${r[c.iSs]}`); });
  c.sh.getRange(2, c.iSs + 1, Math.max(1, c.sh.getLastRow() - 1), 1).clearContent();
}
/** Sanity check of the current IDs - run before go-live. */
function checkSeriesSheetIds_v4() {
  const season = entriesSeason_v3(), md = getMasterData_v3();
  md.seriesList.forEach(s => { const id = getSeriesSheetId_v4(s.id);
    if (id) Logger.log(`${s.id}: ${workbookValid_v4(id, s, season) || 'OK'}`); });
}