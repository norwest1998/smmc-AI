/**
 * ============================================================================
 * HOMEPAGE DATA API  (Google Apps Script Web App)
 * ============================================================================
 * Backend for the SMMC HomePage landing site. This is a STANDALONE Apps Script
 * project (its own script ID / deployment - see README.md in this folder).
 * Deploy as a Web App (Execute as: Me, Access: Anyone) and paste the /exec URL
 * into the HOME_DATA_API constant in the HomePage HTML.
 *
 * ENDPOINTS (GET):
 *   ?action=latestResults
 *       Finds the most recent "Processed" event in SMMC Annual Calendar ->
 *       "Event Data" (status in column O), resolves the Overall Results
 *       workbook  "Overall Results <Class> <RegattaType> <Season>"
 *       (Drive folder "Overall Results Sheets", or the cached
 *       regattaWorkbookId_* script property), locates the last round
 *       ("Round N" sheet, or the right-most "Round N" column on the
 *       "Overall Results" sheet) and returns the top finishers.
 *
 *   ?action=membershipStats
 *       Returns totals + breakdowns for the four HomePage topics:
 *         members      - Club Management "Members"      by member type
 *         applications - Membership Applications rows   by Status (col B)
 *         boats        - Club Management "ClassMembers" by ClassName
 *         financial    - Club Management "Members"      by Paid up
 *
 *   ?ss=<spreadsheetId>                        -> {sheets:[{name,gid}]}
 *   ?ss=<spreadsheetId>&sheet=<name>           -> {meta, headers, rows}
 *       Legacy discovery contract kept for the Championship Standings
 *       module, so this single deployment can serve the whole page.
 * 
 *   ?action=membersList   → returns { members: [...] }
 *   ?action=applicationsList → returns { applications: [...] }
 * 
 * ============================================================================
 */

// ================================ CONFIGURATION ===============================

var HPAPI_CFG = {
  // Spreadsheet IDs (leave blank to resolve by name via DriveApp)
  clubManagementId: '1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI',
  clubManagementName: 'SMMC Club Management',

  membershipAppsId: '1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk',
  membershipSheetName: 'Membership Applications',
  membershipDataStartRow: 8,

  annualCalendarId: '1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM',                    // e.g. '1AbC...' - blank = resolve by name
  annualCalendarName: 'SMMC Annual Calendar',
  eventDataSheet: 'Event Data',
  eventDataStatusCol: 15,                  // Column O - fallback when no "Status" header

  overallFolderName: 'Overall Results Sheets',
  overallSheetName: 'Overall Results',

  topFinishers: 8
};

// =================================== ROUTER ===================================

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    if (params.action === 'latestResults') return json_(getLatestResults());
    if (params.action === 'membershipStats') return json_(getMembershipStats());
    if (params.action === 'membersList')      return json_(getMembersList_());
    if (params.action === 'applicationsList') return json_(getApplicationsList_());

    // Legacy discovery contract (Championship Standings module)
    if (params.ss) {
      if (!/^[A-Za-z0-9_-]{10,}$/.test(params.ss)) {
        return json_({ error: 'Parameter "ss" must be a valid spreadsheet ID.' });
      }
      var ss = SpreadsheetApp.openById(params.ss);
      if (params.sheet) return json_(serveSheet_(ss, params.sheet));
      return json_({ sheets: ss.getSheets().map(function (s) {
        return { name: s.getName(), gid: s.getSheetId() };
      }) });
    }

    return json_({ error: 'Unknown request. Use action=latestResults, action=membershipStats, or ss=[&sheet=].' });
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================== SPREADSHEET UTIL ==============================

/** Opens a configured spreadsheet by ID, falling back to a Drive name search. */
function openSpreadsheet_(configuredId, fallbackName) {
  if (configuredId) return SpreadsheetApp.openById(configuredId);
  var folders = DriveApp.getFoldersByName(fallbackName);
  while (folders.hasNext()) {
    var files = folders.next().getFilesByType(MimeType.GOOGLE_SHEETS);
    if (files.hasNext()) return SpreadsheetApp.openById(files.next().getId());
  }
  throw new Error('Could not find spreadsheet "' + fallbackName + '". Set its ID in HPAPI_CFG.');
}

/** Case/space-insensitive header matcher. Returns 0-based index or -1. */
function findHeader_(headers, candidates) {
  var norm = headers.map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, ''); });
  for (var c = 0; c < norm.length; c++) {
    if (candidates.indexOf(norm[c]) !== -1) return c;
  }
  return -1;
}

/**
 * Coerces a cell value into clean text. Cells holding an in-cell image come
 * back from getValues() as CellImage objects whose String() is "CellImage" -
 * those (and other rich objects/dates) are treated as empty.
 */
function sanitizeCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return '';
  var s = '';
  try { s = String(value); } catch (err) { s = ''; }
  if (/^cellimage$/i.test(s)) return '';
  return s.trim();
}

// ============================== MEMBERS LIST ==================================

/**
 * Returns active members with the fields needed by the Members panel.
 * Source: Club Management "Members" sheet.
 * Columns (0-based, matched by header): Active, MemberName, Membership,
 *   WhatsApp, Committee
 */
function getMembersList_() {
  var ss = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
  var sheet = ss.getSheetByName('Members');
  if (!sheet) throw new Error('"Members" sheet not found in Club Management.');

  var values = sheet.getDataRange().getValues();
  var h = values[0];

  var activeCol    = findHeader_(h, ['active']);
  var nameCol      = findHeader_(h, ['membername', 'name']);
  var membershipCol= findHeader_(h, ['membership', 'membershiptype', 'membertype']);
  var waCol        = findHeader_(h, ['whatsapp']);
  var committeeCol = findHeader_(h, ['committee']); // note: your sheet has a typo

  var members = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];

    // Skip blank rows
    var name = sanitizeCell_(row[nameCol]);
    if (!name) continue;

    // Skip inactive members if Active column exists
    if (activeCol !== -1) {
      var active = row[activeCol];
      var isActive = (active === true ||
                      String(active).trim().toUpperCase() === 'TRUE' ||
                      String(active).trim().toLowerCase() === 'yes');
      if (!isActive) continue;
    }

    members.push({
      name:       name,
      membership: membershipCol !== -1 ? sanitizeCell_(row[membershipCol]) : '',
      whatsapp:   waCol         !== -1 ? sanitizeCell_(row[waCol])         : '',
      committee:  committeeCol  !== -1 ? sanitizeCell_(row[committeeCol])  : ''
    });
  }

  // Sort alphabetically by name
  members.sort(function(a, b) { return a.name.localeCompare(b.name); });

  return { members: members };
}

// ============================ APPLICATIONS LIST ===============================

/**
 * Returns membership applications with the fields needed by the Applications panel.
 * Source: Membership Applications sheet (same as getApplicationStats_).
 * Fields: RowID, Status, Timestamp, First name, Surname, Membership Type,
 *   Name of Current Club, Nominating member name, Seconders member name,
 *   LastStatusUpdated
 */
function getApplicationsList_() {
  var ss = SpreadsheetApp.openById(HPAPI_CFG.membershipAppsId);
  var sheet = ss.getSheetByName(HPAPI_CFG.membershipSheetName || 'Membership Applications');
  if (!sheet) throw new Error('"' + HPAPI_CFG.membershipSheetName + '" sheet not found.');

  var values = sheet.getDataRange().getValues();

  // Your sheet has headers on row 7 (index 6), data from row 8 (index 7)
  var headerRowIdx = 6;
  var dataStartIdx = (HPAPI_CFG.membershipDataStartRow || 8) - 1;
  var h = values[headerRowIdx];
  var tz = Session.getScriptTimeZone();

  var rowIdCol       = findHeader_(h, ['rowid', 'id', 'row id']);
  var statusCol      = findHeader_(h, ['status']);
  var timestampCol   = findHeader_(h, ['timestamp', 'submitted', 'date']);
  var firstNameCol   = findHeader_(h, ['firstname', 'first name', 'given name']);
  var surnameCol     = findHeader_(h, ['surname', 'last name', 'family name']);
  var memTypeCol     = findHeader_(h, ['membershiptype', 'membership type', 'membership']);
  var clubCol        = findHeader_(h, ['nameofcurrentclub', 'current club', 'club']);
  var nominatorCol   = findHeader_(h, ['nominatingmembername', 'nominator', 'nominating member name']);
  var seconderCol    = findHeader_(h, ['secondersmembername', 'seconder', 'seconders member name']);
  var lastUpdatedCol = findHeader_(h, ['laststatusupdated', 'last updated', 'updated']);

  var applications = [];
  for (var r = dataStartIdx; r < values.length; r++) {
    var row = values[r];

    // Skip blank rows (no name and no status)
    var firstName = firstNameCol !== -1 ? sanitizeCell_(row[firstNameCol]) : '';
    var surname   = surnameCol   !== -1 ? sanitizeCell_(row[surnameCol])   : '';
    var status    = statusCol    !== -1 ? sanitizeCell_(row[statusCol])    : '';
    if (!firstName && !surname && !status) continue;

    // Format dates
    var ts = timestampCol !== -1 ? row[timestampCol] : '';
    var tsFormatted = (ts instanceof Date)
      ? Utilities.formatDate(ts, tz, 'd MMM yyyy')
      : sanitizeCell_(ts);

    var lu = lastUpdatedCol !== -1 ? row[lastUpdatedCol] : '';
    var luFormatted = (lu instanceof Date)
      ? Utilities.formatDate(lu, tz, 'd MMM yyyy')
      : sanitizeCell_(lu);

    // RowID: use column value if present, otherwise use the sheet row number
    var rowId = rowIdCol !== -1 ? sanitizeCell_(row[rowIdCol]) : '';
    if (!rowId) rowId = 'ROW-' + (r + 1);

    applications.push({
      rowId:          rowId,
      status:         status,
      timestamp:      tsFormatted,
      firstName:      firstName,
      surname:        surname,
      membershipType: memTypeCol   !== -1 ? sanitizeCell_(row[memTypeCol])   : '',
      club:           clubCol      !== -1 ? sanitizeCell_(row[clubCol])       : '',
      nominator:      nominatorCol !== -1 ? sanitizeCell_(row[nominatorCol]) : '',
      seconder:       seconderCol  !== -1 ? sanitizeCell_(row[seconderCol])  : '',
      lastUpdated:    luFormatted
    });
  }

  return { applications: applications };
}

// ============================== LEGACY DISCOVERY ==============================
//
// Standalone port of the former "Get File Sheets" discovery web app so this
// script no longer depends on any other project. Contract (unchanged):
//   ?ss=<id>&sheet=<name> -> {meta, headers, rows}
// consumed by the Championship Standings module in index.html.

/** Returns one sheet as {meta, headers, rows} using the fixed row layout:
 *  rows 1-6 race/championship info, row 7 headers, data rows 8+. */
function serveSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var values = sheet.getDataRange().getValues();
  var tz = ss.getSpreadsheetTimeZone();
  function fmt(cell) {
    return (cell instanceof Date) ? Utilities.formatDate(cell, tz, 'yyyy/MM/dd') : cell;
  }

  // Rows 1-6: race/championship info
  var meta = [
    values[2][1],       // Row 3, Column B
    fmt(values[2][3]),  // Row 3, Column D
    values[3][1],
    values[3][3]        // Row 4, Column D
  ];

  var headers = values[6]; // row 7 = real column headers
  var rows = [];
  for (var r = 7; r < values.length; r++) {
    var row = values[r];
    var hasContent = false;
    for (var c = 0; c < row.length; c++) { if (row[c] !== '') { hasContent = true; break; } }
    if (!hasContent) continue;
    var out = [];
    for (var c2 = 0; c2 < row.length; c2++) out.push(fmt(row[c2]));
    rows.push(out);
  }

  return { meta: meta, headers: headers, rows: rows };
}

// ============================== LATEST RESULTS ================================

/**
 * Resolves the latest processed event and its last-round results.
 * @return {Object} {ok, event:{roundLabel, championship, racedOn}, results:[...]}
 */
function getLatestResults() {
  var cal = openSpreadsheet_(HPAPI_CFG.annualCalendarId, HPAPI_CFG.annualCalendarName);
  var eventSheet = cal.getSheetByName(HPAPI_CFG.eventDataSheet);
  if (!eventSheet) throw new Error('Sheet "' + HPAPI_CFG.eventDataSheet + '" not found in the Annual Calendar.');

  var values = eventSheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Event Data sheet has no events.');

  // Status column: prefer a "Status"-ish header, else column O.
  var statusCol = findHeader_(values[0], ['status', 'state', 'resultstatus']);
  if (statusCol === -1) statusCol = HPAPI_CFG.eventDataStatusCol - 1;
  if (statusCol >= (values[0].length)) statusCol = values[0].length - 1;

  // Bottom-most "Processed" row = latest completed round.
  var row = null;
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][statusCol]).trim().toLowerCase() === 'processed') { row = values[r]; break; }
  }
  if (!row) throw new Error('No events marked "Processed" were found in Event Data.');

  var raceDate = (row[2] instanceof Date) ? row[2] : new Date(row[2]);
  var cls = sanitizeCell_(row[6]);    // F Class (may hold an in-cell image)
  var type = sanitizeCell_(row[7]);   // G Regatta Type
  var champName = cls + " " + type; // I championship name
  var tz = Session.getScriptTimeZone();

  // Season lives in SMMC Club Management's named ranges (fallback: calendar).
  var season = '';
  try {
    var club = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
    var namedRange = club.getRangeByName('currentSeason');
    if (namedRange) season = sanitizeCell_(namedRange.getValue());
  } catch (err) { /* try the calendar below */ }
  if (!season) {
    try {
      var calRange = cal.getRangeByName('currentSeason');
      if (calRange) season = sanitizeCell_(calRange.getValue());
    } catch (err) { /* season stays blank */ }
  }

  var workbook = findOverallWorkbook_(cls, type, season, champName);
  var round = resolveLastRound_(workbook);

  // Prefer the championship name, then the workbook's series name
  // ("Overall Results <series> <season>" -> "<series>"), then class/type.
  var seriesName = champName;
  if (!seriesName) {
    seriesName = workbook.getName().replace(/^Overall Results\s*/i, '').trim();
    if (season) seriesName = seriesName.split(season).join('').trim();
  }
  if (!seriesName) seriesName = (cls + ' ' + type).trim();
  if (!seriesName) seriesName = 'Latest Round';

  return {
    ok: true,
    event: {
      roundLabel: round.label,
      championship: champName,
      racedOn: Utilities.formatDate(raceDate, tz, 'd MMM'),
      className: cls,
      regattaType: type,
      season: season
    },
    results: round.results.slice(0, HPAPI_CFG.topFinishers),
    workbook: workbook.getName()
  };
}

/**
 * Finds the Overall Results workbook for a class / regatta type / season.
 * Order: cached script property -> exact name in folder -> scored fuzzy match.
 * The championship name (Event Data column I) is tried first because workbooks
 * are named "Overall Results <regattaName> <season>". Empty tokens always
 * match, so a Class cell holding an in-cell image doesn't break the search.
 */
function findOverallWorkbook_(cls, type, season, champName) {
  var candidates = [];
  if (champName) {
    if (season) candidates.push(('Overall Results ' + champName + ' ' + season).replace(/\s+/g, ' ').trim());
    candidates.push(('Overall Results ' + champName).replace(/\s+/g, ' ').trim());
  }
  if (cls || type) {
    if (season) candidates.push(('Overall Results ' + cls + ' ' + type + ' ' + season).replace(/\s+/g, ' ').trim());
    candidates.push(('Overall Results ' + cls + ' ' + type).replace(/\s+/g, ' ').trim());
  }

  // 1. Cached property (set by Race Results Automation when it creates workbooks)
  var props = PropertiesService.getScriptProperties();
  for (var i = 0; i < candidates.length; i++) {
    var cached = props.getProperty('regattaWorkbookId_' + candidates[i]);
    if (cached) {
      try { return SpreadsheetApp.openById(cached); } catch (err) { /* stale cache */ }
    }
  }

  // 2. Exact then scored fuzzy match inside the Overall Results Sheets folder.
  var folders = DriveApp.getFoldersByName(HPAPI_CFG.overallFolderName);
  var fuzzy = null;
  var fuzzyScore = -1;
  while (folders.hasNext()) {
    var files = folders.next().getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      for (var c = 0; c < candidates.length; c++) {
        if (name === candidates[c]) return SpreadsheetApp.openById(file.getId());
      }
      var score = 0, ok = true;
      if (champName && name.indexOf(champName) !== -1) score += 4;
      if (cls) { if (name.indexOf(cls) !== -1) score += 2; else ok = false; }
      if (type) { if (name.toLowerCase().indexOf(type.toLowerCase()) !== -1) score += 1; else ok = false; }
      if (season) { if (name.indexOf(season) !== -1) score += 1; else ok = false; }
      if (ok && score > fuzzyScore) { fuzzy = file; fuzzyScore = score; }
    }
  }
  if (fuzzy && fuzzyScore > 0) return SpreadsheetApp.openById(fuzzy.getId());

  // 3. Last resort - search Drive broadly for the class name.
  if (cls) {
    var hits = DriveApp.searchFiles('mimeType = "' + MimeType.GOOGLE_SHEETS +
        '" and title contains "' + cls.replace(/"/g, '') + '"');
    while (hits.hasNext()) {
      var hit = hits.next();
      var n = hit.getName();
      if (n.indexOf('Overall Results') === 0 &&
          (type === '' || n.toLowerCase().indexOf(type.toLowerCase()) !== -1) &&
          (season === '' || n.indexOf(season) !== -1)) {
        return SpreadsheetApp.openById(hit.getId());
      }
    }
  }

  throw new Error('No Overall Results workbook found. Searched: "' +
      candidates.join('" / "') + '" in folder "' + HPAPI_CFG.overallFolderName +
      '" [Class="' + cls + '", Type="' + type + '", Season="' + season +
      '", Championship="' + champName + '"]');
}

/**
 * Locates the last round in an Overall Results workbook.
 * Prefers a dedicated "Round N" sheet; falls back to the right-most
 * "Round N" column on the "Overall Results" sheet (appendRound layout:
 * label row 4, member names col C, sail col B, net scores rows 5+).
 */
function resolveLastRound_(workbook) {
  // 1. Dedicated "Round N" sheets
  var sheets = workbook.getSheets();
  var bestSheet = null, bestN = 0;
  for (var i = 0; i < sheets.length; i++) {
    var m = sheets[i].getName().match(/^Round\s*(\d+)$/i);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > bestN) { bestN = n; bestSheet = sheets[i]; }
    }
  }
  if (bestSheet) {
    return { label: 'Round ' + bestN, results: parseResultsTable_(bestSheet) };
  }

  // 2. "Overall Results" sheet with rounds as columns ("Round N" headers)
  var overall = workbook.getSheetByName(HPAPI_CFG.overallSheetName);
  if (overall) return parseOverallRoundColumn_(overall);

  throw new Error('No round sheets found in "' + workbook.getName() + '".');
}

/**
 * Parses a per-round results sheet into ranked {pos, sailor, sailNo} objects.
 * Column roles are detected from the header row by name.
 */
function parseResultsTable_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];

  // Find the header row: first row containing both a position-ish and a name-ish cell.
  // Round sheets (roundWrite) use: Pos | Sail # | Competitor | Result | R1..Rn | ...
  var headerRow = -1, posCol = -1, nameCol = -1;
  for (var r = 0; r < Math.min(values.length, 10); r++) {
    var p = findHeader_(values[r], ['pos', 'position', 'rank', 'place']);
    var nm = findHeader_(values[r], ['competitor', 'name', 'sailor', 'membername', 'membername', 'helmsman', 'skipper']);
    if (p !== -1 && nm !== -1) { headerRow = r; posCol = p; nameCol = nm; break; }
  }
  if (headerRow === -1) return []; // unrecognised layout

  var sailCol = findHeader_(values[headerRow], ['sailno', 'sailnumber', 'sail#', 'sail', 'sailno.']);
  var classCol = findHeader_(values[headerRow], ['class', 'classname']);
  var pointsCol = findHeader_(values[headerRow], ['result', 'points' ]);

  var rows = [];
  for (var i = headerRow + 1; i < values.length; i++) {
    var rowVals = values[i];
    var cell = function (col) { return col >= 0 ? String(rowVals[col]).trim() : ''; };
    var sailor = cell(nameCol);
    var sail = cell(sailCol);
    if (!sailor && !sail) continue;

    var posRaw = cell(posCol);
    var posNum = parseInt(posRaw.replace(/[^\d]/g, ''), 10);
    if (isNaN(posNum)) posNum = 9999 + rows.length;

    var points = cell(pointsCol);

    var cls = cell(classCol);
    rows.push({
      sortPos: posNum,
      pos: posNum,
      sailor: sailor,
      sailNo: [sail, cls].filter(function (v) { return v; }).join(' \u2022 '),
      points: points
    });
  }

  rows.sort(function (a, b) { return a.sortPos - b.sortPos; });
  if (Array.isArray(rows)) {
    rows.forEach(function (r) { delete r.sortPos; });
  }
  return rows;
}

/**
 * Extracts the latest round from the "Overall Results" sheet where rounds are
 * columns (appendRound): the "Round N" label sits in row 4 of the round
 * column, member names in column C, sail numbers in column B, and each
 * member's net score for the round in rows 5+. Results are ranked by
 * ascending score (lowest net points first).
 */
function parseOverallRoundColumn_(sheet) {
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 5) return { label: 'Latest Round', results: [] };

  // Scan the top rows for "Round N" labels; keep the right-most column.
  var top = sheet.getRange(1, 1, Math.min(lastRow, 6), lastCol).getDisplayValues();
  var bestCol = -1, bestN = 0;
  for (var c = 0; c < lastCol; c++) {
    for (var r = 0; r < top.length; r++) {
      var m = String(top[r][c]).trim().match(/^Round\s*(\d+)$/i);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > bestN) { bestN = n; bestCol = c; }
        break;
      }
    }
  }
  if (bestCol === -1) return { label: 'Latest Round', results: [] };

  // Locate the member header row (overallSetup puts it on row 4).
  var headerRowIdx = 3, nameCol = 2, sailCol = 1; // sensible defaults for the layout
  for (var hr = 0; hr < top.length; hr++) {
    var nm = findHeader_(top[hr], ['membername', 'competitor', 'name', 'sailor']);
    if (nm !== -1) {
      headerRowIdx = hr;
      nameCol = nm;
      var sc = findHeader_(top[hr], ['sail#', 'sailno', 'sailnumber', 'sail']);
      if (sc !== -1) sailCol = sc;
      break;
    }
  }

  var startRow = headerRowIdx + 2; // headerRowIdx is 0-based: sheet row = idx+1, members start the next row
  var rowCount = lastRow - startRow + 1;
  if (rowCount < 1) return { label: 'Round ' + bestN, results: [] };

  var scoreVals = sheet.getRange(startRow, bestCol + 1, rowCount, 1).getDisplayValues();
  var nameVals = sheet.getRange(startRow, nameCol + 1, rowCount, 1).getDisplayValues();
  var sailVals = sheet.getRange(startRow, sailCol + 1, rowCount, 1).getDisplayValues();

  var rows = [];
  for (var i = 0; i < rowCount; i++) {
    var sailor = String(nameVals[i][0]).trim();
    var sail = String(sailVals[i][0]).trim();
    if (!sailor && !sail) continue;
    var score = parseFloat(String(scoreVals[i][0]).replace(/[^\d.\-]/g, ''));
    if (isNaN(score)) continue; // no result recorded for this member
    rows.push({ score: score, sailor: sailor, sailNo: sail });
  }

  rows.sort(function (a, b) { return a.score - b.score; });
  var results = rows.map(function (r, idx) {
    return { pos: idx + 1, sailor: r.sailor, sailNo: r.sailNo };
  });
  return { label: 'Round ' + bestN, results: results };
}

// ============================ MEMBERSHIP STATISTICS ===========================

/**
 * Collects the four Membership Statistics topics with their breakdowns.
 * @return {Object} {topics:{members, applications, boats, financial}, updatedAt}
 */
function getMembershipStats() {
  var topics = {
    members: getMemberStats_(),
    applications: getApplicationStats_(),
    boats: getBoatStats_(),
    financial: getFinancialStats_()
  };
  return {
    topics: topics,
    updatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy HH:mm')
  };
}

/** Counts rows by grouping values of a column. Blank group values -> label. */
function countBy_(values, colIndex, startRow, fallbackLabel) {
  var counts = {};
  for (var r = startRow; r < values.length; r++) {
    var raw = values[r][colIndex];
    var key = ((raw === null || raw === undefined) ? '' : String(raw).trim()) || fallbackLabel;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.keys(counts)
    .sort(function (a, b) { return counts[b] - counts[a]; })
    .map(function (k) { return { name: k, count: counts[k] }; });
}

function sumCounts_(breakdown) {
  return breakdown.reduce(function (sum, b) { return sum + b.count; }, 0);
}

/** Total Members - Members sheet grouped by member type. */
function getMemberStats_() {
  var ss = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
  var sheet = ss.getSheetByName('Members');
  if (!sheet) throw new Error('"Members" sheet not found in Club Management.');

  var values = sheet.getDataRange().getValues();
  var typeCol = findHeader_(values[0], ['membertype', 'membershiptype', 'membership', 'type', 'category']);
  if (typeCol === -1) throw new Error('Member Type column not found in the Members sheet.');

  var breakdown = countBy_(values, typeCol, 1, 'Unspecified');
  return { total: sumCounts_(breakdown), sub: 'Across ' + breakdown.length + ' member types', breakdown: breakdown };
}

/** Online Applications - application row count grouped by Status. */
function getApplicationStats_() {
  var ss = SpreadsheetApp.openById(HPAPI_CFG.membershipAppsId);
  var sheet = ss.getSheetByName(HPAPI_CFG.membershipSheetName || 'Membership Applications');
  if (!sheet) throw new Error('"' + HPAPI_CFG.membershipSheetName + '" sheet not found.');

  var values = sheet.getDataRange().getValues();
  var start = (HPAPI_CFG.membershipDataStartRow || 8) - 1;
  var statusCol = findHeader_(values[6] || values[0], ['status']); // headers live on row 7
  if (statusCol === -1) statusCol = 1; // Column B fallback

  var counts = {};
  var total = 0;
  for (var r = start; r < values.length; r++) {
    var hasContent = String(values[r][0]).trim() !== '' || String(values[r][statusCol]).trim() !== '';
    if (!hasContent) continue;
    total++;
    var status = String(values[r][statusCol]).trim() || 'Unknown';
    counts[status] = (counts[status] || 0) + 1;
  }

  var breakdown = Object.keys(counts)
    .sort(function (a, b) { return counts[b] - counts[a]; })
    .map(function (k) { return { name: k, count: counts[k] }; });

  var processed = counts['Processed'] || 0;
  return {
    total: total,
    sub: (total - processed) + ' in progress',
    breakdown: breakdown
  };
}

/** Registered Boats - ClassMembers sheet grouped by ClassName. */
function getBoatStats_() {
  var ss = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
  var sheet = ss.getSheetByName('ClassMembers');
  if (!sheet) throw new Error('"ClassMembers" sheet not found in Club Management.');

  var values = sheet.getDataRange().getValues();
  var classCol = findHeader_(values[0], ['classname', 'class']);
  if (classCol === -1) classCol = 3; // ClassName is column D

  var breakdown = countBy_(values, classCol, 1, 'Unclassified');
  return { total: sumCounts_(breakdown), sub: 'Across ' + breakdown.length + ' classes', breakdown: breakdown };
}

/** Financial Status - Members sheet grouped by the Paid up checkbox. */
function getFinancialStats_() {
  var ss = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
  var sheet = ss.getSheetByName('Members');
  if (!sheet) throw new Error('"Members" sheet not found in Club Management.');

  var values = sheet.getDataRange().getValues();
  var paidCol = findHeader_(values[0], ['paidup', 'paid up', 'paid']);
  if (paidCol === -1) paidCol = 6; // Paid Up is column G

  var paid = 0, unpaid = 0;
  for (var r = 1; r < values.length; r++) {
    var v = values[r][paidCol];
    var memberIdentified = String(values[r][0]).trim() !== '' || String(values[r][2]).trim() !== '';
    if (!memberIdentified) continue;
    if (v === true || String(v).trim().toUpperCase() === 'TRUE' || String(v).trim() === 'Yes') paid++;
    else unpaid++;
  }

  var total = paid + unpaid;
  var pct = total ? Math.round((paid / total) * 100) : 0;
  return {
    total: pct + '%',
    sub: paid + ' of ' + total + ' fees up-to-date',
    breakdown: [
      { name: 'Paid Up', count: paid },
      { name: 'Not Paid', count: unpaid }
    ]
  };
}