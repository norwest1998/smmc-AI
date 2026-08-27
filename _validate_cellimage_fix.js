// Temporary validation for the CellImage/season fix. Deleted after run.
const fs = require('fs');
let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log('PASS  ' + label);
  else { failures++; console.log('FAIL  ' + label + '\n      expected ' + e + '\n      actual   ' + a); }
}

const src = fs.readFileSync('d:/AI Coding/SMMC Automation/HomePage Data API/HomePage Data API.gs', 'utf8');
try { new Function(src); console.log('PASS  Data API syntax'); }
catch (e) { failures++; console.log('FAIL  Data API syntax: ' + e.message); }

// ---- GAS stubs ----
function iter(items) { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; }
let openedIds = [];
global.SpreadsheetApp = {
  openById: id => { openedIds.push(id); return { id, getName: () => 'WB ' + id }; }
};
global.MimeType = { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' };
global.DriveApp = {
  getFoldersByName: name => iter([{ getFilesByType: () => iter(
    global.MOCK_FILES.map(f => ({ getName: () => f, getId: () => 'id:' + f }))
  ) }]),
  searchFiles: () => iter([])
};
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) };
global.Session = { getScriptTimeZone: () => 'Australia/Sydney' };
global.Utilities = { formatDate: () => '16 Aug' };
global.Logger = { log: () => {} };
global.ContentService = { createTextOutput: () => ({ setMimeType: () => {} }), MimeType: { JSON: 0 } };

(0, eval)(src);

// ---- sanitizeCell_ ----
function CellImage() { this.toString = () => 'CellImage'; }
check('sanitize plain string', sanitizeCell_('  DF65  '), 'DF65');
check('sanitize CellImage object', sanitizeCell_(new CellImage()), '');
check('sanitize null', sanitizeCell_(null), '');
check('sanitize number', sanitizeCell_(42), '42');
check('sanitize date -> empty', sanitizeCell_(new Date(2026, 7, 16)), '');

// ---- findOverallWorkbook_ ----
global.MOCK_FILES = [
  'Overall Results DF65 Scratch 2026-7',
  'Overall Results GH General 2026-7',
  'Overall Results IOM Scratch 2026-7'
];

// The exact failing scenario: class was CellImage -> now '', type General, season now found
let wb = findOverallWorkbook_('', 'General', '2026-7', '');
check('empty class + type General + season resolves', wb.id, 'id:Overall Results GH General 2026-7');

// championship name drives the match
wb = findOverallWorkbook_('', '', '2026-7', 'GH General');
check('championship name match', wb.id, 'id:Overall Results GH General 2026-7');

// normal class/type/season still resolves exactly
wb = findOverallWorkbook_('DF65', 'Scratch', '2026-7', '');
check('class/type/season exact', wb.id, 'id:Overall Results DF65 Scratch 2026-7');

// nothing matches -> descriptive error
let threw = '';
try { findOverallWorkbook_('DF65', 'Handicap', '2026-7', ''); }
catch (e) { threw = e.message; }
if (threw.includes('Searched:') && threw.includes('DF65 Handicap 2026-7') && threw.includes('Season="2026-7"')) {
  console.log('PASS  descriptive error on no match');
} else { failures++; console.log('FAIL  unexpected error message: ' + threw); }

// ---- serveSheet_ ----
global.MOCK_SHEET = {
  getSpreadsheetTimeZone: () => 'Australia/Sydney',
  getSheetByName: name => name === 'Overall Results'
    ? { getDataRange: () => ({ getValues: () => global.MOCK_VALUES }) }
    : null
};
global.MOCK_VALUES = [
  ['r1a', 'r1b'],
  ['r2a', 'r2b'],
  ['xx', 'Champ Name', 'yy', new Date(2026, 7, 9)],// row 3: B + D
  ['zz', '16/08/2026', 'ww', 'SMMC'],              // row 4: B + D
  [],                                              // row 5
  [],                                              // row 6
  ['Pos', 'Sailor', 'Sail No'],                    // row 7 = headers
  [1, 'A. Sailor', '123'],               // kept
  ['', '', ''],                          // filtered (empty)
  [2, 'B. Sailor', '456']                // kept
];
const sheetOut = serveSheet_({ getSheetByName: global.MOCK_SHEET.getSheetByName, getSpreadsheetTimeZone: global.MOCK_SHEET.getSpreadsheetTimeZone }, 'Overall Results');
check('serveSheet_ meta values', sheetOut.meta, ['Champ Name', '16 Aug', '16/08/2026', 'SMMC']);
check('serveSheet_ headers row 7', sheetOut.headers, ['Pos', 'Sailor', 'Sail No']);
check('serveSheet_ empty rows filtered', sheetOut.rows.length, 2);
check('serveSheet_ data rows intact', sheetOut.rows, [[1, 'A. Sailor', '123'], [2, 'B. Sailor', '456']]);

let sheetThrew = '';
try { serveSheet_({ getSheetByName: () => null }, 'Nope'); }
catch (e) { sheetThrew = e.message; }
check('serveSheet_ unknown sheet error', sheetThrew, 'Sheet not found: Nope');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(failures ? 1 : 0);
