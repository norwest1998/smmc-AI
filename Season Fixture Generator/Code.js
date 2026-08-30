/*
====================================================================================
 SEASON FIXTURE GENERATOR  (Google Apps Script)
====================================================================================
 Creates the fixtures for a new sailing season in the "Event Data" sheet of the
 "SMMC Annual Calendar" spreadsheet.

 SOURCE DATA (SMMC Club Management spreadsheet):
   - Sheet "Regattas" columns:  ID | ChampionshipName | Class | RegattaType |
                                WeekofMonth | Time
     (headers are located dynamically, so minor naming differences are tolerated)
   - Named Ranges:              currentSeason, currentSeasonStart,
                                currentSeasonEnd, sailingMonths

 BEHAVIOUR:
   - Every Saturday of every sailing month that falls between the season start
     and end dates is scheduled.
   - Two slots per Saturday:  AM = 11:00-13:00,  PM = 14:00-16:00.
   - If a championship in "Regattas" matches the Saturday's week-of-month and
     the slot time, a "Competition" event is created for it (with a unique
     8-character HexKey so the row locks via the sheet's onEdit).
   - Any slot with no matching championship becomes a "Social Sailing" event.
   - Rows are written in chronological order beneath a formatted season title
     row (merged A:I, #3c78d8 background, white, centred).
   - Columns M, N and O are populated for every event row:
       M = =C<row>
       N = =if(G<row>="",concatenate(Text(D<row>,"hh:mm")," - ",
             Text(E<row>,"hh:mm"),"   ",H<row>),
             concatenate(Text(D<row>,"hh:mm")," - ",Text(E<row>,"hh:mm"),
             "   ",G<row>," ",H<row>))
       O = "Not Started"

 USAGE:
   - Run generateSeasonFixtures() directly from the Apps Script editor, or
   - Add a menu item from your existing onOpen(e), e.g.:
         SpreadsheetApp.getUi()
           .createMenu('Fixtures')
           .addItem('Generate Season Fixtures', 'generateSeasonFixtures')
           .addToUi();
     or simply call seasonFixturesMenu() inside your existing onOpen().
====================================================================================
*/

// ================================ CONFIGURATION ================================

// Paste the spreadsheet IDs here if this script is NOT bound (container) to
// those spreadsheets. If left blank, the active spreadsheet is used whenever
// it contains the expected sheet.
var SF_CLUB_MANAGEMENT_ID = '1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI';
var SF_ANNUAL_CALENDAR_ID = '1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM';

var SF_REGATTAS_SHEET   = 'Regattas';
var SF_EVENT_DATA_SHEET = 'Event Data'; // sheet in the Annual Calendar

// Slots (24 hour clock)
var SF_SLOTS = [
  { name: 'AM', startHour: 11, startMinute: 0, finishHour: 13, finishMinute: 0 },
  { name: 'PM', startHour: 14, startMinute: 0, finishHour: 16, finishMinute: 0 }
];

var SF_TITLE_BG = '#3c78d8';
var SF_TITLE_FG = '#ffffff';

// Accepted header names (normalised: lower-case, spaces removed) per field.
var SF_REGATTA_HEADER_ALIASES = {
  id:    ['id', 'regattaid'],
  name:  ['championshipname', 'championship', 'regattaname'],
  cls:   ['class', 'classname'],
  type:  ['regattatype', 'type', 'scoring', 'scoringtype'],
  week:  ['weekofmonth', 'week'],
  time:  ['time', 'slot', 'session']
};

// Header names (normalised) in "Event Data" that may receive the championship
// name (optional column I). If none exists, the name is simply not written.
var SF_NAME_COLUMN_CANDIDATES = ['championshipname', 'championship', 'eventname', 'regattaname'];

var SF_MONTH_TOKENS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

// ================================ MAIN ENTRY ==================================

/**
 * Generates the fixture list for the current season and writes it to the
 * "Event Data" sheet of the Annual Calendar spreadsheet.
 */
function generateSeasonFixtures() {
  var clubSs = resolveSpreadsheet_(SF_CLUB_MANAGEMENT_ID, SF_REGATTAS_SHEET, 'SMMC Club Management');
  var calSs = resolveSpreadsheet_(SF_ANNUAL_CALENDAR_ID, SF_EVENT_DATA_SHEET, 'SMMC Annual Calendar');

  var season = readSeasonConfig_(clubSs);
  Logger.log('Season: %s (%s to %s), sailing months: %s',
      season.name,
      Utilities.formatDate(season.start, Session.getScriptTimeZone(), 'dd/mm/yyyy'),
      Utilities.formatDate(season.end, Session.getScriptTimeZone(), 'dd/mm/yyyy'),
      season.monthTokens.join(', '));

  var regattas = readRegattas_(clubSs);
  Logger.log('Loaded %s championship definitions.', regattas.length);

  var events = buildSeasonSchedule_(season, regattas);
  if (!events.length) {
    notify_('No Saturdays found for the configured sailing months between the ' +
        'season start and end dates. Nothing was written.');
    return;
  }

  var sheet = calSs.getSheetByName(SF_EVENT_DATA_SHEET);
  if (!sheet) throw new Error('Sheet "' + SF_EVENT_DATA_SHEET + '" was not found.');

  writeSeasonBlock_(sheet, season.name, events);
}

// ============================ SPREADSHEET RESOLUTION ===========================

/**
 * Returns the spreadsheet holding the required sheet. Uses the configured ID
 * when supplied, otherwise falls back to the active spreadsheet.
 */
function resolveSpreadsheet_(configuredId, requiredSheet, label) {
  if (configuredId) {
    var byId = SpreadsheetApp.openById(configuredId);
    if (!byId.getSheetByName(requiredSheet)) {
      throw new Error(label + ': sheet "' + requiredSheet + '" not found in the configured spreadsheet.');
    }
    return byId;
  }

  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) { active = null; }

  if (active && active.getSheetByName(requiredSheet)) return active;

  throw new Error('Could not locate the ' + label + ' spreadsheet. Either run/bound this script ' +
      'from that spreadsheet or set its ID at the top of this file.');
}

// ============================ CONFIGURATION READERS ============================

/** Reads the four named ranges that describe the current season. */
function readSeasonConfig_(ss) {
  var name = readNamedValue_(ss, 'currentSeason');
  var start = coerceDate_(readNamedValue_(ss, 'currentSeasonStart'));
  var end = coerceDate_(readNamedValue_(ss, 'currentSeasonEnd'));
  var monthTokens = readSailingMonths_(ss);

  if (!name) throw new Error('Named range "currentSeason" is empty or missing.');
  if (!start || isNaN(start.getTime())) throw new Error('Named range "currentSeasonStart" does not contain a valid date.');
  if (!end || isNaN(end.getTime())) throw new Error('Named range "currentSeasonEnd" does not contain a valid date.');
  if (!monthTokens.length) throw new Error('Named range "sailingMonths" is empty or missing.');
  if (dateOnly_(start) > dateOnly_(end)) throw new Error('currentSeasonStart is after currentSeasonEnd.');

  return {
    name: String(name).trim(),
    start: start,
    end: end,
    monthTokens: monthTokens,
    monthIndexes: monthTokens.map(monthIndexFromToken_).filter(function (i) { return i >= 0; })
  };
}

/** Reads a named range value, throwing a helpful error when it is missing. */
function readNamedValue_(ss, name) {
  var range = ss.getRangeByName(name);
  if (!range) throw new Error('Named range "' + name + '" was not found in ' + ss.getName() + '.');
  return range.getValue();
}

/**
 * Reads the sailingMonths named range. Supports a vertical/horizontal list of
 * cells or a single comma separated cell, e.g. "September, October, ...".
 */
function readSailingMonths_(ss) {
  var range = ss.getRangeByName('sailingMonths');
  if (!range) throw new Error('Named range "sailingMonths" was not found.');

  var values = range.getValues()
    .reduce(function (acc, row) { return acc.concat(row); }, [])
    .map(function (v) { return String(v).trim(); })
    .filter(function (v) { return v !== ''; });

  if (values.length === 1 && values[0].indexOf(',') !== -1) {
    values = values[0].split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ''; });
  }
  return values;
}

/**
 * Reads the Regattas sheet into plain objects. Headers are matched through
 * SF_REGATTA_HEADER_ALIASES so slight naming variations are tolerated.
 */
function readRegattas_(ss) {
  var sheet = ss.getSheetByName(SF_REGATTAS_SHEET);
  if (!sheet) throw new Error('Sheet "' + SF_REGATTAS_SHEET + '" was not found.');

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(normalizeHeader_);
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var col = {};
  Object.keys(SF_REGATTA_HEADER_ALIASES).forEach(function (field) {
    col[field] = -1;
    for (var c = 0; c < headers.length; c++) {
      if (SF_REGATTA_HEADER_ALIASES[field].indexOf(headers[c]) !== -1) { col[field] = c; break; }
    }
  });

  ['week', 'time'].forEach(function (requiredField) {
    if (col[requiredField] === -1) {
      throw new Error('Required column not found in "' + SF_REGATTAS_SHEET + '": ' +
          JSON.stringify(SF_REGATTA_HEADER_ALIASES[requiredField]));
    }
  });

  var regattas = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var week = parseWeekOfMonth_(row[col.week]);
    var time = normalizeTimeSlot_(row[col.time]);
    if (!week || !time) continue; // incomplete definition - skip quietly

    regattas.push({
      id: col.id >= 0 ? String(row[col.id]).trim() : '',
      name: col.name >= 0 ? String(row[col.name]).trim() : '',
      cls: col.cls >= 0 ? String(row[col.cls]).trim() : '',
      type: col.type >= 0 ? String(row[col.type]).trim() : '',
      week: week,
      time: time
    });
  }
  return regattas;
}

// ---- [pure-helpers-start] =====================================================

/** Strips time-of-day, returning midnight of the same date. */
function dateOnly_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** All Saturdays (Date objects at midnight) within the given month. */
function getSaturdaysInMonth_(year, monthIndex) {
  var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  var saturdays = [];
  for (var d = 1; d <= daysInMonth; d++) {
    var date = new Date(year, monthIndex, d);
    if (date.getDay() === 6) saturdays.push(date);
  }
  return saturdays;
}

/** Parses "1st" / "2" / 2 / "Third" into the week-of-month number (1-5), else 0. */
function parseWeekOfMonth_(value) {
  var v = String(value).trim().toLowerCase();
  var ordinals = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  if (ordinals.hasOwnProperty(v)) return ordinals[v];
  var match = v.match(/\d+/);
  if (!match) return 0;
  var n = parseInt(match[0], 10);
  return n >= 1 && n <= 5 ? n : 0;
}

/** Normalises a slot value ("am", "AM", "Morning", "Afternoon"...) to AM / PM, else "". */
function normalizeTimeSlot_(value) {
  var v = String(value).trim().toUpperCase();
  if (!v) return '';
  if (v.indexOf('MORN') === 0 || (v.charAt(0) === 'A' && v.indexOf('AFT') !== 0)) return 'AM';
  if (v.indexOf('AFT') === 0 || v.charAt(0) === 'P') return 'PM';
  return '';
}

/** Maps a month token ("September", "Sep", "09", 9) to a month index 0-11. */
function monthIndexFromToken_(token) {
  var t = String(token).trim().toLowerCase().replace(/\.$/, '');
  if (/^\d{1,2}$/.test(t)) {
    var n = parseInt(t, 10);
    return n >= 1 && n <= 12 ? n - 1 : -1;
  }
  var key = t.substring(0, 3);
  return Object.prototype.hasOwnProperty.call(SF_MONTH_TOKENS, key) ? SF_MONTH_TOKENS[key] : -1;
}

/**
 * Builds the complete, chronologically ordered fixture plan.
 * @param {{name:string, start:Date, end:Date, monthIndexes:number[]}} season
 * @param {Array<{name:string, cls:string, type:string, week:number, time:string}>} regattas
 * @return {Array<{date:Date, slot:object, regatta:(object|null)}>}
 */
function buildSeasonSchedule_(season, regattas) {
  var start = dateOnly_(season.start);
  var end = dateOnly_(season.end);
  var events = [];

  var cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    if (season.monthIndexes.indexOf(cursor.getMonth()) !== -1) {
      var saturdays = getSaturdaysInMonth_(cursor.getFullYear(), cursor.getMonth());
      for (var s = 0; s < saturdays.length; s++) {
        var saturday = saturdays[s];
        if (saturday < start || saturday > end) continue;
        var weekOfMonth = Math.ceil(saturday.getDate() / 7);
        for (var i = 0; i < SF_SLOTS.length; i++) {
          var slot = SF_SLOTS[i];
          var matches = [];
          for (var r = 0; r < regattas.length; r++) {
            if (regattas[r].week === weekOfMonth && regattas[r].time === slot.name) {
              matches.push(regattas[r]);
            }
          }
          if (matches.length) {
            for (var m = 0; m < matches.length; m++) {
              events.push({ date: saturday, slot: slot, regatta: matches[m] });
            }
          } else {
            events.push({ date: saturday, slot: slot, regatta: null });
          }
        }
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  var slotOrder = {};
  SF_SLOTS.forEach(function (slot, idx) { slotOrder[slot.name] = idx; });

  events.sort(function (a, b) {
    var diff = a.date.getTime() - b.date.getTime();
    if (diff !== 0) return diff;
    return slotOrder[a.slot.name] - slotOrder[b.slot.name];
  });

  return events;
}

// ---- [pure-helpers-end] =======================================================

// =============================== SHEET WRITER ==================================

/**
 * Appends the formatted season title row followed by all event rows, applies
 * number formats and fills columns M, N and O.
 */
function writeSeasonBlock_(sheet, seasonName, events) {
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var existing = lastRow > 0 ? sheet.getRange(1, 1, lastRow, Math.min(lastCol, 9)).getValues() : [];
  var titleText = seasonName + ' Season';

  // Guard against accidentally duplicating the same season block.
  for (var r = 0; r < existing.length; r++) {
    for (var c = 0; c < existing[r].length; c++) {
      if (String(existing[r][c]).trim() === titleText) {
        var ui = SpreadsheetApp.getUi();
        var proceed = ui.alert('Season Exists',
            'A "' + titleText + '" block already exists in "' + sheet.getName() +
            '".\n\nAdd the fixtures again anyway?', ui.ButtonSet.YES_NO);
        if (proceed !== ui.Button.YES) {
          notify_('Aborted - no changes were made.');
          return;
        }
      }
    }
  }

  // Detect an optional 9th (column I) header able to hold the championship name.
  var headers = existing.length ? existing[0] : [];
  var nameColIdx = -1; // zero based within A:I
  for (var h = 0; h < headers.length && h < 9; h++) {
    if (SF_NAME_COLUMN_CANDIDATES.indexOf(normalizeHeader_(headers[h])) !== -1) {
      nameColIdx = h;
      break;
    }
  }
  var writeWidth = nameColIdx >= 0 ? 9 : 8;

  // Unique HexKeys for competition rows (locked by the sheet's onEdit).
  var seenKeys = {};
  for (var k = 0; k < existing.length; k++) {
    var existingKey = String(existing[k][0]).trim().toUpperCase();
    if (existingKey) seenKeys[existingKey] = true;
  }
  var compEvents = events.filter(function (e) { return e.regatta; });
  var hexKeys = generateUniqueHexKeys_(compEvents.length, seenKeys);

  // Build the rows (columns A..H, plus I when a name column exists).
  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
  var keyIdx = 0;
  var rows = events.map(function (ev) {
    var isComp = !!ev.regatta;
    var row = [
      isComp ? hexKeys[keyIdx++] : '',                                        // A HexKey
      monthNames[ev.date.getMonth()],                                         // B Month
      new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate()), // C Date
      new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate(),
               ev.slot.startHour, ev.slot.startMinute),                       // D Start
      new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate(),
               ev.slot.finishHour, ev.slot.finishMinute),                     // E Finish
      isComp ? ev.regatta.cls : '',                                           // F Class
      isComp ? ev.regatta.type : '',                                          // G Regatta Type
      isComp ? 'Competition' : 'Social Sailing'                               // H Competition
    ];
    row.push(isComp && nameColIdx >= 0 ? ev.regatta.name : '');               // I optional
    return row.slice(0, writeWidth);
  });

  // Make room and write the title row.
  var titleRow = lastRow + 1;
  var firstDataRow = titleRow + 1;
  var rowsNeeded = titleRow + rows.length - sheet.getMaxRows();
  if (rowsNeeded > 0) sheet.insertRowsAfter(sheet.getMaxRows(), rowsNeeded);

  sheet.getRange(titleRow, 1)
    .setValue(titleText)
    .setFontWeight('bold');
  sheet.getRange(titleRow, 1, 1, 9)   // always merge across A:I per spec
    .merge()
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground(SF_TITLE_BG)
    .setFontColor(SF_TITLE_FG);

  // Event rows.
  sheet.getRange(firstDataRow, 1, rows.length, writeWidth).setValues(rows);
  sheet.getRange(firstDataRow, 3, rows.length, 1).setNumberFormat('dd/mm/yyyy'); // Date
  sheet.getRange(firstDataRow, 4, rows.length, 2).setNumberFormat('hh:mm');      // Start / Finish

  // Columns M, N, O.
  var formulas = [];
  var statuses = [];
  for (var i = 0; i < rows.length; i++) {
    var rowNum = firstDataRow + i;
    formulas.push([
      '=C' + rowNum,
      '=if(G' + rowNum + '="",concatenate(Text(D' + rowNum + ',"hh:mm")," - ",' +
          'Text(E' + rowNum + ',"hh:mm"), "   ",H' + rowNum + '),' +
          'concatenate(Text(D' + rowNum + ',"hh:mm")," - ",Text(E' + rowNum + ',"hh:mm"),"   ",' +
          'G' + rowNum + '," ",H' + rowNum + '))'
    ]);
    statuses.push(['Not Started']);
  }
  sheet.getRange(firstDataRow, 13, formulas.length, 2).setFormulas(formulas); // M:N
  sheet.getRange(firstDataRow, 15, statuses.length, 1).setValues(statuses);   // O

  Logger.log('Wrote %s fixture rows to "%s" starting at row %s.',
      rows.length, sheet.getName(), titleRow);
}

// ================================ HEX KEY GEN ==================================

/** Generates count unique 8 character hexadecimal keys, updating seenKeys. */
function generateUniqueHexKeys_(count, seenKeys) {
  var keys = [];
  while (keys.length < count) {
    var candidate = randomHex8_();
    if (!seenKeys.hasOwnProperty(candidate)) {
      seenKeys[candidate] = true;
      keys.push(candidate);
    }
  }
  return keys;
}

function randomHex8_() {
  var out = '';
  for (var i = 0; i < 8; i++) out += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  return out;
}

// ================================== UTILITIES ==================================

/** Normalises a header cell for alias matching. */
function normalizeHeader_(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, '');
}

/** Coerces a value into a Date where possible. */
function coerceDate_(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return null;
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Shows a message via UI when available, always logging as well. */
function notify_(message) {
  Logger.log(message);
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (err) {
    // Running head-less (e.g. from a trigger) - logging only.
  }
}







