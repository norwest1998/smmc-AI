function clearRoundColumn(sh, roundColIdx, dataRowCount) {
  const lastRow = OVERALL_META_ROW_1;
  sh.getRange(OVERALL_META_ROW_1, roundColIdx).clearContent();
  sh.getRange(OVERALL_META_ROW_2, roundColIdx).clearContent();
  sh.getRange(OVERALL_HEADER_ROW, roundColIdx).clearContent();
  if (dataRowCount > 0) {
    sh.getRange(OVERALL_DATA_START_ROW, roundColIdx, dataRowCount, 1).clearContent();
  }
}
/**
 * Checks the Overall Results sheet for missing members and adds them,
 * backfilling any previously completed rounds with the DNC score for that round.
 */
function ensureMembersInOverall(bookID, rankedScores, raceType) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName('Overall Results');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  const existingNames = lastRow >= OVERALL_DATA_START_ROW
    ? new Set(sh.getRange(OVERALL_DATA_START_ROW, 4, lastRow - OVERALL_DATA_START_ROW + 1, 1)
        .getValues().flat().map(normalizeName))
    : new Set();

  const newMembers = rankedScores.filter(sc =>
    sc.member && !existingNames.has(normalizeName(sc.member))
  );

  if (newMembers.length === 0) return;

  console.log(`Found ${newMembers.length} new member(s) to add to Overall Results: ` +
    newMembers.map(m => m.member).join(', '));

  const roundColStart = 8; // column, unaffected by row layout
  const completedRoundCount = lastCol >= roundColStart ? lastCol - roundColStart : 0;

  let dncByRound = [];
  if (completedRoundCount > 0) {
    dncByRound = sh.getRange(OVERALL_META_ROW_1, roundColStart, 1, completedRoundCount).getValues()[0];
  }

  const insertAt = lastRow + 1;
  const newRows = newMembers.map(m => ['', m.sail, m.member, '', '', '']);
  sh.getRange(insertAt, 2, newRows.length, 6).setValues(newRows);

  if (completedRoundCount > 0) {
    newMembers.forEach((m, rowOffset) => {
      const sheetRow = insertAt + rowOffset;
      sh.getRange(sheetRow, roundColStart, 1, completedRoundCount).setValues([dncByRound]);
      console.log(`Backfilled ${completedRoundCount} round(s) with DNC for: ${m.member}`);
    });
  }

  const newLastRow = sh.getLastRow();
  const fullBodyRange = sh.getRange(OVERALL_DATA_START_ROW, 2, newLastRow - OVERALL_DATA_START_ROW + 1, 6);
  const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground('#FFF9C4')
    .setRanges([fullBodyRange])
    .build();
  sh.setConditionalFormatRules([evenRowRule]);

  if (raceType === 'Handicap') {
    const hs = ss.getSheetByName('Handicaps');
    if (hs) {
      const hsLastRow = hs.getLastRow();
      const hsExistingNames = hsLastRow >= OVERALL_DATA_START_ROW
        ? new Set(hs.getRange(OVERALL_DATA_START_ROW, 4, hsLastRow - OVERALL_DATA_START_ROW + 1, 1)
            .getValues().flat().map(normalizeName))
        : new Set();

      const hsNewMembers = newMembers.filter(m => !hsExistingNames.has(normalizeName(m.member)));

      if (hsNewMembers.length > 0) {
        const hsInsertAt = hsLastRow + 1;
        const hsNewRows = hsNewMembers.map(m => ['', m.sail, m.member, m.hcap || 0, '', '']);
        hs.getRange(hsInsertAt, 2, hsNewRows.length, 6).setValues(hsNewRows);

        const hsLastCol = hs.getLastColumn();
        const hsCompletedRounds = hsLastCol >= roundColStart ? hsLastCol - roundColStart : 0;
        if (hsCompletedRounds > 0) {
          hsNewMembers.forEach((m, rowOffset) => {
            const hsSheetRow = hsInsertAt + rowOffset;
            hs.getRange(hsSheetRow, roundColStart, 1, hsCompletedRounds)
              .setValues([Array(hsCompletedRounds).fill('-')]);
          });
        }

        const hsNewLastRow = hs.getLastRow();
        const hsFullBodyRange = hs.getRange(OVERALL_DATA_START_ROW, 2, hsNewLastRow - OVERALL_DATA_START_ROW + 1, 6);
        const hsEvenRowRule = SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=ISEVEN(ROW())')
          .setBackground('#FFF9C4')
          .setRanges([hsFullBodyRange])
          .build();
        hs.setConditionalFormatRules([hsEvenRowRule]);

        console.log(`Added ${hsNewMembers.length} new member(s) to Handicaps sheet.`);
      }
    }
  }

  console.log('New member rows inserted and backfilled successfully.');
}

function getBoatId(sail, memberName, className) {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.masterDataSpreadsheetId);
  const sheet = ss.getSheetByName("ClassMembers");

  const memberData = sheet.getDataRange().getValues();

  for (let i = 1; i < memberData.length; i++) {
    const classMatches = (className === 'General') || (memberData[i][3] === className);
    if (memberData[i][2] === memberName && memberData[i][4] === sail && classMatches) {
      return memberData[i][0];
    }
  }
  return "Boat Id not found";
}

/**
 * Looks up the EventID from the Annual Calendar spreadsheet
 * by matching ClassName and Date (exact match on date)
 * Assumes: Sheet named "Event Data", Column A = EventID, Column B = Date, Column C = ClassName (or adjust columns)
 *
 * @param {Date} raceDate - The parsed race date (JavaScript Date object)
 * @param {string} className - The parsed class name
 * @return {string|null} EventID or null if not found
 */
function lookupEventID(raceDate, className) {
  const cfg = getConfig();
  const calendarId = cfg.calendarSpreadsheetId;
  if (!calendarId) {
    Logger.log('WARNING: Calendar spreadsheet ID not configured.');
    return null;
  }

  const ss = SpreadsheetApp.openById(calendarId);
  const sheet = ss.getSheetByName('Event Data');
  if (!sheet) {
    Logger.log('ERROR: Sheet "Event Data" not found in calendar spreadsheet.');
    return null;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null; // No data

  // Assume headers in row 1
  // Adjust these column indices if your layout differs:
  const EVENTID_COL = 0;   // Column A (index 0)
  const DATE_COL = 1;      // Column B
  const CLASS_COL = 2;     // Column C

  const targetDateStr = Utilities.formatDate(raceDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  for (let i = 1; i < data.length; i++) { // Start from row 2
    const rowDate = data[i][DATE_COL];
    const rowClass = (data[i][CLASS_COL] || '').toString().trim();
    const rowEventID = (data[i][EVENTID_COL] || '').toString().trim();

    if (!rowEventID) continue;

    let rowDateStr = '';
    if (rowDate instanceof Date) {
      rowDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (typeof rowDate === 'string') {
      rowDateStr = rowDate.trim();
    }

    if (rowDateStr === targetDateStr && rowClass.toLowerCase() === className.toLowerCase()) {
      Logger.log(`Found EventID ${rowEventID} for ${className} on ${targetDateStr}`);
      return rowEventID;
    }
  }

  Logger.log(`No EventID found for ${className} on ${targetDateStr}`);
  return null;
}

function findMemberByClassAndSail(className, sail, classMembersMap) {
  if (!className || !sail) return null;

  const boats = classMembersMap[String(className).trim()];
  if (!boats || boats.length === 0) return null;

  return findByName(boats, sail, 'sailnumber');
}

/**
 * Finds the value corresponding to a label in a key:value sheet format.
 * Expects label in column A and value in column B.
 */
function findLabelValue(values, label) {
    // 1. Prepare the search label once, making it lowercase and clean.
    const searchLabel = (label || '').toLowerCase().trim();

    // Handle empty search label scenario
    if (searchLabel === '') {
        return null;
    }

    // 2. Iterate through each row in the 2D array 'values'.
    for (let r = 0; r < values.length; r++) {
        const row = values[r];
        
        // 3. Iterate through each cell (column) in the current row.
        // We stop one cell before the end because we need to return the value
        // *to the right* (at index c + 1).
        for (let c = 0; c < row.length - 1; c++) {
            
            // 4. Get the cell value, clean it (trim, remove colon, lowercase),
            // and ensure it's a string for comparison.
            const cellValue = (row[c] || '').toString().trim().replace(':', '').toLowerCase();
            
            // 5. Check if the cleaned cell value contains the search label.
            if (cellValue.includes(searchLabel)) {
                
                // 6. If found, return the value from the cell immediately to the right.
                // It's wrapped in a toString().trim() for consistency.
                return (row[c + 1] || '').toString().trim();
            }
        }
    }

    // 7. If the label is not found after checking all cells, return null.
    return null;
}


function lockSheetForAutomation(sheet) {
  if (!sheet) return;
  
  // Remove existing protections to prevent conflicts
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (let i = 0; i < protections.length; i++) {
    protections[i].remove();
  }

  const protection = sheet.protect().setDescription('Automation Locked');
  
  // Ensure only the person running the script (you) can edit
  const me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors());
  
  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}