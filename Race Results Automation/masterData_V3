/**
 * masterData_v3.js — v3 data layer. The SERIES sheet (Racing Formats workbook) drives everything:
 *   Series.AllowedClasses -> class(es) (blank = 'General' roster)      Series.FormatID -> racing format + race specs
 *   Series.EntryRequired / EntryType (Member | Boat)       Series.HandicapTracking ('Series' = handicaps tracked in the SeriesEntries sheet)
 *   Series.SeriesName -> the regatta name used everywhere (round numbers, overall workbook, archive)
 * Regatta Type is no longer used.
 *
 * Depends only on the ORIGINAL v2 files (no patched v2 files needed): scoring_v2 (expandRaceSpecs_v2),
 * ScoringHelpers_v2 (getDiscardCount_v2, getAdjustmentBracket_v2, resolveFormulaToken_v2),
 * rankScores_v2 (rankScoresMap_v2). Round sheets are written by roundSheet_v3 (roundWrite_v3).
 */
const RACING_FORMATS_SS_ID_V3 = '1zoB6C-54EGanjw1FTI1lGtxSia-BAvcBySbAtI1-qr0';   // "Racing Formats" workbook
let BASE_DATA_V3_CACHE = null;

/* ---------- small helpers ---------- */
const isTrue_v3 = v => v === true || String(v).trim().toUpperCase() === 'TRUE';

/** Case/space-insensitive column read from a raw row object. */
function col_v3(row, name) {
  if (!row) return '';
  const k = Object.keys(row).find(k => String(k).trim().toLowerCase() === String(name).toLowerCase());
  return k === undefined || row[k] === null || row[k] === undefined ? '' : row[k];
}

/** Reads a sheet into objects keyed by trimmed header (no column mapping). */
function rawRows_v3(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Racing Formats workbook: sheet '${name}' not found.`);
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0].map(x => String(x).trim());
  return v.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

/** Overall / handicap-adjustment key for a competitor: by member (EntryType Member) or by boat (EntryType Boat). */
function entryKey_v3(entryType, member, sail) {
  const m = normalizeName(member);
  return String(entryType).toLowerCase() === 'boat' ? m + '|' + String(sail).trim() : m;
}

/** True when handicap adjustments are tracked for this series AND its format has handicap races. */
function hasHandicapSheet_v3(series) {
  const f = series && series.resolvedFormat;
  return !!(f && series.handicapTracking === 'series' && (f.raceSpecs || []).some(s => s.raceType === 'handicap'));
}

/* ---------- loading ---------- */
function getMasterData_v3() {
  // Members / classes / boats are cached; Series, formats and specs are tiny and always read fresh so edits
  // made in Racing Management apply immediately.
  return Object.assign({}, getBaseData_v3(), loadSeries_v3());
}

function getBaseData_v3() {
  if (BASE_DATA_V3_CACHE !== null) return BASE_DATA_V3_CACHE;
  const cache = CacheService.getScriptCache();
  const cached = cache.get('MASTER_DATA_V3_BASE2');
  if (cached) {
    try { BASE_DATA_V3_CACHE = JSON.parse(cached); return BASE_DATA_V3_CACHE; } catch (e) { /* reload below */ }
  }
  BASE_DATA_V3_CACHE = loadBaseData_v3();
  try { cache.put('MASTER_DATA_V3_BASE2', JSON.stringify(BASE_DATA_V3_CACHE), 900); } catch (e) { Logger.log('v3 base cache failed: ' + e.message); }
  return BASE_DATA_V3_CACHE;
}

function loadBaseData_v3() {
  const cfg = getConfig();
  if (!cfg.masterDataSpreadsheetId) throw new Error('MASTER DATA spreadsheet id not set.');
  const ss = SpreadsheetApp.openById(cfg.masterDataSpreadsheetId);

  const members = sheetToObjects(ss, SHEET_MEMBERS, ['memberId', 'active', 'membername']);
  const classes = sheetToObjects(ss, SHEET_CLASSES, ['classId', 'classname']);
  const allClassMembersRows = sheetToObjects(
    ss, SHEET_CLASSMEMBERS,
    ['boatId', 'active', 'membername', 'classname', 'sailnumber', 'model', 'handicap', 'hrn', 'gh', 'ghcap']
  );

  const membersById = {};
  members.forEach(m => { if (m.memberId) membersById[m.memberId] = m; });
  const classesById = {};
  classes.forEach(c => { if (c.classId) classesById[c.classId] = c; });

  const memberIdByName = {};                                   // for SeriesEntries.MemberID
  members.forEach(m => { if (m.memberId && m.membername) memberIdByName[normalizeName(m.membername)] = m.memberId; });

  const classMembersMap = {};
  allClassMembersRows.filter(r => r.active).forEach(r => {
    if (!classMembersMap[r.classname]) classMembersMap[r.classname] = [];
    classMembersMap[r.classname].push({ membername: r.membername, sailnumber: r.sailnumber, boatId: r.boatId, hcap: r.handicap });
  });
  allClassMembersRows.filter(r => r.gh).forEach(r => {
    if (!classMembersMap['General']) classMembersMap['General'] = [];
    classMembersMap['General'].push({ membername: r.membername, sailnumber: r.sailnumber, boatId: r.boatId, hcap: r.ghcap });
  });

  return { members, membersById, memberIdByName, classes, classesById, classMembersMap };
}

function loadSeries_v3() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.racingFormatsSpreadsheetId || RACING_FORMATS_SS_ID_V3);
  const fmtRows = rawRows_v3(ss, 'RacingFormats');
  const specRows = rawRows_v3(ss, 'RaceSpecs');
  const seriesRows = rawRows_v3(ss, 'Series');

  // Race specs (active only), by format, in sequence order
  const specsByFormat = {};
  specRows.forEach(sp => {
    if (String(col_v3(sp, 'active')).trim().toUpperCase() === 'FALSE') return;      // removed in Racing Management
    const fId = String(col_v3(sp, 'formatId')).trim();
    if (!fId) return;
    let config = {};
    const raw = col_v3(sp, 'configJson');
    if (raw) {
      try { config = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch (e) { Logger.log(`Warning: bad configJson for spec ${col_v3(sp, 'specId')}: ${e.message}`); }
    }
    const w = col_v3(sp, 'weight');
    (specsByFormat[fId] = specsByFormat[fId] || []).push({
      specId: col_v3(sp, 'specId'),
      formatId: fId,
      sequence: Number(col_v3(sp, 'sequence')) || 1,
      raceType: String(col_v3(sp, 'raceType') || 'scratch').trim().toLowerCase(),
      count: Number(col_v3(sp, 'count')) || 1,
      weight: w === '' ? 1.0 : (isFinite(Number(w)) ? Number(w) : 1.0),
      config
    });
  });
  Object.keys(specsByFormat).forEach(f => specsByFormat[f].sort((a, b) => a.sequence - b.sequence));

  // Formats. WeightingFormat: blank / 'none' = no weighting; anything containing 'particip' = participation weighting.
  const formatsById = {};
  fmtRows.forEach(f => {
    const fId = String(col_v3(f, 'formatId')).trim();
    if (!fId) return;
    const wf = String(col_v3(f, 'WeightingFormat')).trim().toLowerCase();
    const participation = wf.indexOf('particip') > -1 || wf === 'true';
    const allowed = String(col_v3(f, 'allowedClassIds')).trim();
    formatsById[fId] = {
      formatId: fId,
      name: col_v3(f, 'name'),
      description: col_v3(f, 'description'),
      active: String(col_v3(f, 'active')).trim().toUpperCase() !== 'FALSE',
      weightingFormat: participation ? 'participation' : 'none',
      participationWeighting: participation,
      scoringSystem: participation ? 'highpoint' : normScoring_v3(col_v3(f, 'scoringSystem')),   // participation is always high-point
      discardsRule: String(col_v3(f, 'discardsRule')).trim(),
      allowedClassIds: allowed ? allowed.split(',').map(s => s.trim()).filter(Boolean) : [],
      raceSpecs: specsByFormat[fId] || []
    };
  });

  // Series
  const seriesById = {}, seriesByName = {}, seriesList = [];
  seriesRows.forEach(r => {
    const id = String(col_v3(r, 'ID')).trim(), name = String(col_v3(r, 'SeriesName')).trim();
    if (!id || !name) return;
    const formatId = String(col_v3(r, 'FormatID')).trim();
    // AllowedClasses: one class, a comma list, or blank (= mixed fleet, 'General' roster). Falls back to the old 'Class' column.
    const allowedRaw = String(col_v3(r, 'AllowedClasses') || col_v3(r, 'Class')).trim();
    const allowedClasses = allowedRaw ? allowedRaw.split(',').map(x => x.trim()).filter(Boolean) : [];
    const s = {
      id, name,
      allowedClasses,
      className: allowedClasses.length === 1 ? allowedClasses[0] : '',   // single class, else 'General'
      insignia: col_v3(r, 'Insignia'),
      weekOfMonth: col_v3(r, 'WeekofMonth'), time: col_v3(r, 'Time'), coordinator: col_v3(r, 'Coordinator'),
      formatId,
      entryRequired: isTrue_v3(col_v3(r, 'EntryRequired')),
      entryType: /boat/i.test(String(col_v3(r, 'EntryType'))) ? 'boat' : 'member',
      handicapTracking: String(col_v3(r, 'HandicapTracking')).trim().toLowerCase() === 'series' ? 'series' : '',
      resolvedFormat: formatsById[formatId] || null
    };
    seriesById[id.toLowerCase()] = s;
    seriesByName[name.toLowerCase()] = s;
    seriesList.push(s);
  });

  return { racingFormats: formatsById, seriesById, seriesByName, seriesList };
}

/* ---------- resolving a results file to its series ---------- */

/** Best effort: SeriesID of an Event Data row, looked up by event id. Returns '' if it can't be found. */
function lookupSeriesIdForEvent_v3(eventID) {
  try {
    const cfg = getConfig();
    const ss = SpreadsheetApp.openById(cfg.calendarSpreadsheetId || cfg.masterDataSpreadsheetId);
    const sh = ss.getSheetByName('Event Data');
    if (!sh) return '';
    const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim().toLowerCase());
    const iSeries = h.indexOf('seriesid');
    const iKey = ['hexkey', 'eventid', 'id'].map(n => h.indexOf(n)).find(i => i > -1);
    if (iSeries < 0 || iKey === undefined) return '';
    const row = v.slice(1).find(r => String(r[iKey]).trim() === String(eventID).trim());
    return row ? String(row[iSeries]).trim() : '';
  } catch (e) {
    Logger.log('lookupSeriesIdForEvent_v3: ' + e.message);
    return '';
  }
}

/**
 * Finds the series for a parsed results file: parsed.seriesId, else the Event Data row's SeriesID,
 * else a SeriesName match on parsed.regattaName / parsed.seriesName.
 */
function resolveSeries_v3(parsed, md) {
  let s = null;
  const sid = String(parsed.seriesId || parsed.SeriesID || '').trim().toLowerCase();
  if (sid) s = md.seriesById[sid];
  if (!s && parsed.eventID) {
    const looked = lookupSeriesIdForEvent_v3(parsed.eventID).toLowerCase();
    if (looked) s = md.seriesById[looked];
  }
  if (!s) {
    const nm = String(parsed.seriesName || parsed.regattaName || '').trim().toLowerCase();
    s = md.seriesByName[nm] || md.seriesById[nm];
  }
  if (!s) throw new Error(`No Series found for event ${parsed.eventID || '?'} (seriesId='${parsed.seriesId || ''}', name='${parsed.regattaName || ''}').`);
  if (!s.resolvedFormat) throw new Error(`Series '${s.name}' (${s.id}) has no valid FormatID, so it can't be scored automatically.`);
  return s;
}

/** Boats that may race in the series: its allowed classes (de-duplicated), or the 'General' roster when mixed. */
function rosterForSeries_v3(md, series) {
  const map = md.classMembersMap || {};
  const keyOf = c => Object.keys(map).find(k => k.toLowerCase() === String(c).toLowerCase());
  if (!series.allowedClasses.length) return map['General'] || [];
  const seen = {}, out = [];
  series.allowedClasses.forEach(c => {
    (map[keyOf(c)] || []).forEach(b => {
      const k = String(b.boatId) + '|' + b.sailnumber;
      if (!seen[k]) { seen[k] = true; out.push(b); }
    });
  });
  return out;
}

/** Series is the single source of truth: class, regatta name and (removed) regatta type. */
function applySeriesToParsed_v3(parsed, series) {
  parsed.seriesId = series.id;
  parsed.seriesName = series.name;
  parsed.regattaName = series.name;                         // used for round numbers, overall workbook, archive, homepage
  parsed.className = series.className || 'General';         // one allowed class, else mixed fleet = 'General'
  parsed.allowedClasses = series.allowedClasses;
  parsed.entryType = series.entryType;
  parsed.handicapTracking = series.handicapTracking;
  parsed.regattaType = '';                                  // no longer used
  return parsed;
}

/** Logs every series and how it resolves - run from the editor to check the Series sheet. */
function debugSeries_v3() {
  const md = getMasterData_v3();
  md.seriesList.forEach(s => {
    const f = s.resolvedFormat;
    Logger.log(`${s.id} | ${s.name} | allowed='${s.allowedClasses.join('+') || 'General'}' | ${s.entryType} | entry=${s.entryRequired} | hcapTracking='${s.handicapTracking}' | ` +
      (f ? `${f.name}: ${f.scoringSystem}, weighting=${f.weightingFormat}, discards=${f.discardsRule || 'default'}, specs=` +
           f.raceSpecs.map(x => `${x.count}x${x.raceType}(w${x.weight})`).join('+') : 'NO FORMAT'));
  });
}