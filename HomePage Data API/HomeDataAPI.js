// --- CACHE UTILITIES ---
function putCachedData(key, string) {
  var cache = CacheService.getScriptCache();
  var chunkSize = 90000; // Safe threshold well below 100KB
  var chunks = Math.ceil(string.length / chunkSize);
  var data = {};
  data[key + '_chunks'] = String(chunks);
  for (var i = 0; i < chunks; i++) {
    data[key + '_' + i] = string.substring(i * chunkSize, (i + 1) * chunkSize);
  }
  cache.putAll(data, 21600); // 6 hours (outlives the 5-hour trigger)
}

function getCachedData(key) {
  var cache = CacheService.getScriptCache();
  var chunksStr = cache.get(key + '_chunks');
  if (!chunksStr) return null;
  var chunks = parseInt(chunksStr, 10);
  var keys = [];
  for (var i = 0; i < chunks; i++) keys.push(key + '_' + i);
  var data = cache.getAll(keys);
  var string = '';
  for (var i = 0; i < chunks; i++) {
    if (typeof data[key + '_' + i] === 'undefined') return null;
    string += data[key + '_' + i];
  }
  return string;
}

function clearCachedData(key) {
  var cache = CacheService.getScriptCache();
  var chunksStr = cache.get(key + '_chunks');
  if (chunksStr) {
    var chunks = parseInt(chunksStr, 10);
    var keys = [key + '_chunks'];
    for (var i = 0; i < chunks; i++) keys.push(key + '_' + i);
    cache.removeAll(keys);
  }
}

// --- SCHEDULED TRIGGER ---
function setupCacheTrigger() {
  // Clear any existing triggers for this function to prevent duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'refreshBootstrapCache') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Set to run every 5 hours in the background
  ScriptApp.newTrigger('refreshBootstrapCache')
           .timeBased()
           .everyHours(5)
           .create();
           
  // Run once immediately to warm the cache
  refreshBootstrapCache();
}

function refreshBootstrapCache() {
  var data = {
    latestResults: getLatestResults(),
    stats:         safe_(getMembershipStats),
    members:       safe_(function () { return getMembersList_().members; }),
    boats:         safe_(function () { return getBoatsList().boats; }),
    applications:  safe_(function () { return getApplicationsList_().applications; }),
    requests:      safe_(function () { return getRequestList().requests; })
  };
  
  putCachedData('HP_BOOTSTRAP_DATA', JSON.stringify(data));
  return data;
}

// ================================ CONFIGURATION ===============================

var HPAPI_CFG = {
  clubManagementId: '1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI',
  clubManagementName: 'SMMC Club Management',

  membershipAppsId: '1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk',
  membershipSheetName: 'Membership Applications',
  membershipDataStartRow: 8,

  annualCalendarId: '1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM',
  annualCalendarName: 'SMMC Annual Calendar',
  eventDataSheet: 'Event Data',
  eventDataStatusCol: 15,

  overallFolderName: 'Overall Results Sheets',
  overallSheetName: 'Overall Results',

  averageReqId: '1FqOMVZnUbTUtruE5QJ_dmscabdMU7BuEHTfjysNuC18',
  requestsSheetName: 'AvgScrReq',

  weatherId: '1EYuf5wi4Gw-4WP1hdg9sZsOO9tbRx_Z-q5go8BBEOGc',
  weatherForecastName: 'Weather Forecast',
  weatherSheetName: 'WZ Daily Forecast',

  topFinishers: 8
};
const WEATHER_URL = `https://script.google.com/macros/s/AKfycbworw_FnbKehShRIfhbXTuxlAa36jJt8d7MLCvjzAWUfp-_xXORa2ZzC_0m20msa1oj/exec?action=data&callback=renderWeather`;

// =================================== ROUTER ===================================

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    // Intercept cache clear webhook from Gateway.js
    if (params.action === 'clearCache') {
      if (params.key !== PropertiesService.getScriptProperties().getProperty('CLEAR_KEY'))
        return json_({ error: 'Forbidden' });
      clearCachedData('HP_BOOTSTRAP_DATA');
      return json_({ success: true, message: 'Cache busted successfully' });
    }
  
    if (params.action === 'latestResults') return json_(getLatestResults());
    if (params.action === 'membershipStats') return json_(getMembershipStats());
    if (params.action === 'membersList')      return json_(getMembersList_());
    if (params.action === 'applicationsList') return json_(getApplicationsList_());
    if (params.action === 'boatsList') return json_(getBoatsList());
    if (params.action === 'reqList') return json_(getRequestList());
    if (params.action === 'bootstrap') return json_(getBootstrapData(false));

    // Legacy discovery contract (Championship Standings module)
    if (params.ss) { 
      if (!/^[A-Za-z0-9_-]{10,}$/.test(params.ss)) { 
        return json_({ error: 'Parameter "ss" must be a valid spreadsheet ID.' }); 
      } 
      if (!isAllowedWorkbook_(params.ss)) return json_({ error: 'Not permitted' });
      var ss = SpreadsheetApp.openById(params.ss); 
      if (params.sheet) return json_(serveSheet_(ss, params.sheet)); 
      
      // Filter out hidden sheets before mapping the data
      return json_({ 
        sheets: ss.getSheets()
          .filter(function (s) { 
            return !s.isSheetHidden(); 
          })
          .map(function (s) { 
            return { name: s.getName(), gid: s.getSheetId() }; 
          }) 
      }); 
    }


    return json_({ error: 'Unknown request. Use action=latestResults, action=membershipStats, or ss=[&sheet=].' });
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var p = verifyToken(b.token);                       // same helpers + TOKEN_SECRET as the other projects
    if (!p) return json_({ code: 'AUTH', error: 'Unauthorized' });
    if (b.action === 'bootstrapPrivate') {
      var d = getBootstrapData(true);
      if (p.role === 'viewer' && d.requests) d.requests.forEach(function (r) { delete r.email; delete r.readon; });
      return json_(d);
    }
    return json_({ error: 'Unknown action' });
  } catch (err) { return json_({ error: String((err && err.message) || err) }); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================== SPREADSHEET UTIL ==============================
function isAllowedWorkbook_(id) {
  var cache = CacheService.getScriptCache(), k = 'OK_WB_' + id, hit = cache.get(k);
  if (hit) return hit === '1';
  var ok = false;
  try {
    var ps = DriveApp.getFileById(id).getParents();
    while (ps.hasNext()) if (ps.next().getName() === HPAPI_CFG.overallFolderName) ok = true;
  } catch (e) {}
  cache.put(k, ok ? '1' : '0', 21600);
  return ok;
}

function openSpreadsheet_(configuredId, fallbackName) {
  if (configuredId) return SpreadsheetApp.openById(configuredId);
  var folders = DriveApp.getFoldersByName(fallbackName);
  while (folders.hasNext()) {
    var files = folders.next().getFilesByType(MimeType.GOOGLE_SHEETS);
    if (files.hasNext()) return SpreadsheetApp.openById(files.next().getId());
  }
  throw new Error('Could not find spreadsheet "' + fallbackName + '". Set its ID in HPAPI_CFG.');
}

function findHeader_(headers, candidates) {
  var norm = headers.map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, ''); });
  for (var c = 0; c < norm.length; c++) {
    if (candidates.indexOf(norm[c]) !== -1) return c;
  }
  return -1;
}

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

function safe_(fn) {
  try { return fn(); } catch (e) { console.error(e); return null; }
}
 
function getBootstrapData(includePrivate) {
  var d = null;
  var cachedStr = getCachedData('HP_BOOTSTRAP_DATA');
  if (cachedStr) { try { d = JSON.parse(cachedStr); } catch (e) {} }
  if (!d) d = refreshBootstrapCache();
  return includePrivate ? d : { latestResults: d.latestResults, stats: d.stats };
}

function getRequestList() {
  const ss = openSpreadsheet_(HPAPI_CFG.averageReqId);
  const sheet = ss.getSheetByName(HPAPI_CFG.requestsSheetName);
  if (!sheet) throw new Error('"AvgScrReq" sheet not found in system.');

  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const idx = h => headers.indexOf(h);
  const requests = rows
    .filter(r => r[idx('Request ID')] !== '')
    .map(r => ({
      reqId:        r[idx('Request ID')],
      timestamp:    r[idx('Timestamp')],
      member:       r[idx('Member Name')],
      email:        r[idx('Member Email')],
      eventId:      r[idx('EventID')],
      date:         r[idx('Date')],
      className:    r[idx('Class')],
      regattaType:  r[idx('Regatta Type')],
      conflict:     r[idx('Conflicting Regatta')],
      status:       r[idx('Status')],
      readon:       r[idx('Rejected Reason')],
      committee:    r[idx('Decision By')],
      decisionDate: r[idx('Decision Date')],
      emailSent:    r[idx('Email Sent')]
    }));
  return { requests };
}


function getBoatsList() {
  const ss = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
  const sheet = ss.getSheetByName('ClassMembers');
  if (!sheet) throw new Error('"ClassMembers" sheet not found in Club Management.');

  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const idx = h => headers.indexOf(h);
  const boats = rows
    .filter(r => r[idx('BoatID')] !== '')
    .map(r => ({
      boatId:   r[idx('BoatID')],
      active:   !!r[idx('Active')],
      member:   r[idx('Member')],
      class:    r[idx('Class')],
      sailNo:   r[idx('SailNo')],
      model:    r[idx('Model')],
      handicap: r[idx('Handicap')],
      hrn:      r[idx('HRN')],
      gh:       !!r[idx('GH')],
      ghHcap:   r[idx('GH')] ? r[idx('GH HCap')] : null,
      colour:   r[idx('Hull Colour')]
    }));
  return { boats };
}

// ============================== MEMBERS LIST ==================================

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
  var committeeCol = findHeader_(h, ['committee']); 

  var members = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = sanitizeCell_(row[nameCol]);
    if (!name) continue;

    members.push({
      name:       name,
      membership: membershipCol !== -1 ? sanitizeCell_(row[membershipCol]) : '',
      active:     activeCol     !== -1 ? (row[activeCol] === true     || String(row[activeCol]).toLowerCase()     === 'true') : false,
      whatsapp:   waCol         !== -1 ? (row[waCol] === true         || String(row[waCol]).toLowerCase()         === 'true') : false,
      committee:  committeeCol  !== -1 ? (row[committeeCol] === true  || String(row[committeeCol]).toLowerCase()  === 'true') : false
    });
  }

  members.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return { members: members };
}

// ============================ APPLICATIONS LIST ===============================

function getApplicationsList_() {
  var ss = SpreadsheetApp.openById(HPAPI_CFG.membershipAppsId);
  var sheet = ss.getSheetByName(HPAPI_CFG.membershipSheetName || 'Membership Applications');
  if (!sheet) throw new Error('"' + HPAPI_CFG.membershipSheetName + '" sheet not found.');

  var values = sheet.getDataRange().getValues();
  var headerRowIdx = 6;
  var dataStartIdx = (HPAPI_CFG.membershipDataStartRow || 8) - 1;
  var h = values[headerRowIdx];
  var tz = Session.getScriptTimeZone();

  var rowIdCol        = findHeader_(h, ['rowid', 'id', 'row id']);
  var statusCol       = findHeader_(h, ['status']);
  var timestampCol    = findHeader_(h, ['timestamp', 'submitted', 'date']);
  var firstNameCol    = findHeader_(h, ['firstname', 'first name', 'given name']);
  var surnameCol      = findHeader_(h, ['surname', 'last name', 'family name']);
  var memTypeCol      = findHeader_(h, ['membershiptype', 'membership type', 'membership']);
  var clubCol         = findHeader_(h, ['nameofcurrentclub', 'current club', 'club']);
  var nominatorCol    = findHeader_(h, ['nominatingmembername', 'nominator', 'nominating member name']);
  var seconderCol     = findHeader_(h, ['secondersmembername', 'seconder', 'seconders member name']);
  var lastUpdatedCol  = findHeader_(h, ['laststatusupdated', 'last updated', 'updated']);
  var votesForCol     = findHeader_(h, ['votesfor', 'votes for', 'for']);
  var votesAgainstCol = findHeader_(h, ['votesagainst', 'votes against', 'against']);
  var approvedCol     = findHeader_(h, ['membership approved', 'membershipapproved', 'membership_approved', 'membership approved?']);
  var turnAroundCol   = findHeader_(h, ['turnaround time', 'turnaroundtime', 'turnaround_time', 'turnaround time?']);

  var applications = [];
  for (var r = dataStartIdx; r < values.length; r++) {
    var row = values[r];
    var firstName = firstNameCol !== -1 ? sanitizeCell_(row[firstNameCol]) : '';
    var surname   = surnameCol   !== -1 ? sanitizeCell_(row[surnameCol])   : '';
    var status    = statusCol    !== -1 ? sanitizeCell_(row[statusCol])    : '';
    if (!firstName && !surname && !status) continue;

    var ts = timestampCol !== -1 ? row[timestampCol] : '';
    var tsFormatted = (ts instanceof Date)
      ? Utilities.formatDate(ts, tz, 'd MMM yyyy')
      : sanitizeCell_(ts);

    var lu = lastUpdatedCol !== -1 ? row[lastUpdatedCol] : '';
    var luFormatted = (lu instanceof Date)
      ? Utilities.formatDate(lu, tz, 'd MMM yyyy')
      : sanitizeCell_(lu);

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
      votesFor:       votesForCol     !== -1 ? row[votesForCol]     : '',
      votesAgainst:   votesAgainstCol !== -1 ? row[votesAgainstCol] : '',
      lastUpdated:    luFormatted,
      approved:       approvedCol  !== -1 ? sanitizeCell_(row[approvedCol])  : '',
      turnAround:     turnAroundCol   !== -1 ? sanitizeCell_(row[turnAroundCol])  : ''
    });
  }

  return { applications: applications };
}

// ============================== LEGACY DISCOVERY ==============================

function serveSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.isSheetHidden()) throw new Error('Sheet not found: ' + sheetName)

  var values = sheet.getDataRange().getValues();
  var tz = ss.getSpreadsheetTimeZone();
  function fmt(cell) {
    return (cell instanceof Date) ? Utilities.formatDate(cell, tz, 'yyyy/MM/dd') : cell;
  }

  var meta = [
    values[2][1],       
    fmt(values[2][3]),  
    values[3][1],
    values[3][3]        
  ];

  var headers = values[6]; 
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

function getLatestResults() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('HP_LATEST_RESULTS_CACHE');
  if (raw) {
    try { var cached = JSON.parse(raw); if (cached && cached.ok) return cached; } catch (e) { }
  }

  var sc = CacheService.getScriptCache();
  var hit = sc.get('HP_LATEST_RESULTS_FALLBACK');
  if (hit) return JSON.parse(hit);

  try {
    var built = buildLatestResults_();
    sc.put('HP_LATEST_RESULTS_FALLBACK', JSON.stringify(built), 1800);
    return built;
  } catch (err) {
    console.error('Latest results fallback failed: ' + err);
    return {
      ok: false,
      event: { roundLabel: "-", championship: "Awaiting Results", racedOn: "-" },
      results: [],
      workbook: "",
      error: String((err && err.message) || err)
    };
  }
}

function buildLatestResults_() {
  var ss = openSpreadsheet_(HPAPI_CFG.annualCalendarId, HPAPI_CFG.annualCalendarName);
  var sheet = ss.getSheetByName(HPAPI_CFG.eventDataSheet);
  if (!sheet) throw new Error('"' + HPAPI_CFG.eventDataSheet + '" sheet not found.');

  var values = sheet.getDataRange().getValues();
  var statusCol = findHeader_(values[0], ['status']);
  if (statusCol === -1) statusCol = HPAPI_CFG.eventDataStatusCol - 1;

  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var best = null;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (String(row[statusCol]).trim().toLowerCase() !== 'processed') continue;
    var d = row[2] instanceof Date ? row[2] : new Date(row[2]);   
    if (isNaN(d) || d > now) continue;
    if (!best || d > best.date) best = { date: d, row: row };
  }
  if (!best) throw new Error('No processed events found.');

  var cls = String(best.row[6] || '').trim();          
  var type = String(best.row[7] || '').trim();         
  var champ = String(best.row[8] || '').trim();        
  var season = String(best.row[10] || '').trim() || (typeof deriveSeason_ === 'function' ? deriveSeason_(best.date) : String(best.date.getFullYear()));

  var wb = findOverallWorkbook_(cls, type, season, champ);
  var round = resolveLastRound_(wb);

  return {
    ok: true,
    event: {
      roundLabel: round.label,
      championship: champ || (cls + ' ' + type).trim(),
      className: cls,
      boatClass: cls,
      racedOn: Utilities.formatDate(best.date, tz, 'd MMM yyyy')
    },
    results: round.results.slice(0, HPAPI_CFG.topFinishers),
    workbook: wb.getName()
  };
}

function findOverallWorkbook_(cls, type, season, champName) {

  const cacheKey = `WB_ID_${cls}_${type}_${season}`;
  const props = PropertiesService.getScriptProperties();
  
  let cachedId = props.getProperty(cacheKey);
  if (cachedId) {
    try { 
       return SpreadsheetApp.openById(cachedId); 
    } catch (e) { 
       props.deleteProperty(cacheKey);
    }
  }

  var candidates = [];
  if (champName) {
    if (season) candidates.push(('Overall Results ' + champName + ' ' + season).replace(/\s+/g, ' ').trim());
    candidates.push(('Overall Results ' + champName).replace(/\s+/g, ' ').trim());
  }
  if (cls || type) {
    if (season) candidates.push(('Overall Results ' + cls + ' ' + type + ' ' + season).replace(/\s+/g, ' ').trim());
    candidates.push(('Overall Results ' + cls + ' ' + type).replace(/\s+/g, ' ').trim());
  }

  for (var i = 0; i < candidates.length; i++) {
    var cached = props.getProperty('regattaWorkbookId_' + candidates[i]);
    if (cached) {
      try { return SpreadsheetApp.openById(cached); } catch (err) {  }
    }
  }

  var folders = DriveApp.getFoldersByName(HPAPI_CFG.overallFolderName);
  var fuzzy = null;
  var fuzzyScore = -1;
  while (folders.hasNext()) {
    var files = folders.next().getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      for (var c = 0; c < candidates.length; c++) {
        if (name === candidates[c]) {
          props.setProperty(cacheKey, file.getId());
          return SpreadsheetApp.openById(file.getId());
        }
      }
      var score = 0, ok = true;
      if (champName && name.indexOf(champName) !== -1) score += 4;
      if (cls) { if (name.indexOf(cls) !== -1) score += 2; else ok = false; }
      if (type) { if (name.toLowerCase().indexOf(type.toLowerCase()) !== -1) score += 1; else ok = false; }
      if (season) { if (name.indexOf(season) !== -1) score += 1; else ok = false; }
      if (ok && score > fuzzyScore) { fuzzy = file; fuzzyScore = score; }
    }
  }

  if (fuzzy && fuzzyScore > 0) {
    props.setProperty(cacheKey, fuzzy.getId());
    return SpreadsheetApp.openById(fuzzy.getId());
  }

  if (cls) {
    var hits = DriveApp.searchFiles('mimeType = "' + MimeType.GOOGLE_SHEETS +
        '" and title contains "' + cls.replace(/"/g, '') + '"');
    while (hits.hasNext()) {
      var hit = hits.next();
      var n = hit.getName();
      if (n.indexOf('Overall Results') === 0 &&
          (type === '' || n.toLowerCase().indexOf(type.toLowerCase()) !== -1) &&
          (season === '' || n.indexOf(season) !== -1)) {
        props.setProperty(cacheKey, hit.getId());
        return SpreadsheetApp.openById(hit.getId());
      }
    }
  }

  throw new Error('No Overall Results workbook found. Searched: "' +
      candidates.join('" / "') + '" in folder "' + HPAPI_CFG.overallFolderName +
      '" [Class="' + cls + '", Type="' + type + '", Season="' + season +
      '", Championship="' + champName + '"]');
}

function resolveLastRound_(workbook) {
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

  var overall = workbook.getSheetByName(HPAPI_CFG.overallSheetName);
  if (overall) return parseOverallRoundColumn_(overall);

  throw new Error('No round sheets found in "' + workbook.getName() + '".');
}

function parseResultsTable_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];

  var headerRow = -1, posCol = -1, nameCol = -1;
  for (var r = 0; r < Math.min(values.length, 10); r++) {
    var p = findHeader_(values[r], ['pos', 'position', 'rank', 'place']);
    var nm = findHeader_(values[r], ['competitor', 'name', 'sailor', 'membername', 'membername', 'helmsman', 'skipper']);
    if (p !== -1 && nm !== -1) { headerRow = r; posCol = p; nameCol = nm; break; }
  }
  if (headerRow === -1) return [];

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

function parseOverallRoundColumn_(sheet) {
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 5) return { label: 'Latest Round', results: [] };

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

  var headerRowIdx = 3, nameCol = 2, sailCol = 1; 
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

  var startRow = headerRowIdx + 2; 
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
    if (isNaN(score)) continue; 
    rows.push({ score: score, sailor: sailor, sailNo: sail });
  }

  rows.sort(function (a, b) { return a.score - b.score; });
  var results = rows.map(function (r, idx) {
    return { pos: idx + 1, sailor: r.sailor, sailNo: r.sailNo };
  });
  return { label: 'Round ' + bestN, results: results };
}

// ============================ MEMBERSHIP STATISTICS ===========================

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

function getApplicationStats_() {
  var ss = SpreadsheetApp.openById(HPAPI_CFG.membershipAppsId);
  var sheet = ss.getSheetByName(HPAPI_CFG.membershipSheetName || 'Membership Applications');
  if (!sheet) throw new Error('"' + HPAPI_CFG.membershipSheetName + '" sheet not found.');

  var values = sheet.getDataRange().getValues();
  var start = (HPAPI_CFG.membershipDataStartRow || 8) - 1;
  var statusCol = findHeader_(values[6] || values[0], ['status']);
  if (statusCol === -1) statusCol = 1; 

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

function getBoatStats_() {
  var ss = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
  var sheet = ss.getSheetByName('ClassMembers');
  if (!sheet) throw new Error('"ClassMembers" sheet not found in Club Management.');

  var values = sheet.getDataRange().getValues();
  var classCol = findHeader_(values[0], ['classname', 'class']);
  if (classCol === -1) classCol = 3; 

  var activeCol = findHeader_(values[0], ['active']);
  if (activeCol === -1) activeCol = 1; 

  function isActive_(v) {
    return v === true || String(v).trim().toUpperCase() === 'TRUE' || String(v).trim() === 'Yes';
  }

  var activeRows = [values[0]]; 
  for (var r = 1; r < values.length; r++) {
    if (isActive_(values[r][activeCol])) activeRows.push(values[r]);
  }

  var breakdown = countBy_(activeRows, classCol, 1, 'Unclassified');
  return { total: sumCounts_(breakdown), sub: 'Across ' + breakdown.length + ' classes', breakdown: breakdown };
}

function getFinancialStats_() {
  var ss = openSpreadsheet_(HPAPI_CFG.clubManagementId, HPAPI_CFG.clubManagementName);
  var sheet = ss.getSheetByName('Members');
  if (!sheet) throw new Error('"Members" sheet not found in Club Management.');

  var values = sheet.getDataRange().getValues();
  var paidCol = findHeader_(values[0], ['paidup', 'paid up', 'paid']);
  if (paidCol === -1) paidCol = 6; 

  var activeCol = findHeader_(values[0], ['active']);
  var typeCol   = findHeader_(values[0], ['membership', 'membershiptype', 'membertype']);

  function isActive_(v) {
    return v === true || String(v).trim().toUpperCase() === 'TRUE' || String(v).trim() === 'Yes';
  }

  var paid = 0, unpaid = 0;
  for (var r = 1; r < values.length; r++) {
    var v = values[r][paidCol];
    var memberIdentified = String(values[r][0]).trim() !== '' || String(values[r][2]).trim() !== '';
    if (!memberIdentified) continue;

    if (activeCol !== -1 && !isActive_(values[r][activeCol])) continue;
    if (typeCol !== -1) {
      var type = String(values[r][typeCol]).trim().toLowerCase();
      if (type !== 'full' && type !== 'affiliate') continue;
    }

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