  /**
 * helpers_v4.js — v4 versions of the helpers whose behaviour changed. All other helpers.js functions are reused as they are
 * (getBoatId, lookupEventID, sheetToObjects, archiveProcessedFile, ...). Delete getRoundIndexForEvent from helpers.js (unused).
 */

/**
 * Adds boats that raced but are not yet in Overall Results (and Handicaps for tracked series), backfilling the
 * rounds already sailed (D4 columns) with that round's DNC / '-'.
 * v4: backfill count comes from D4 (fixes the one-short count); boat-type series match by member|sail.
 */
function ensureMembersInOverall_v4(bookID, rankedScores, raceType, series) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName('Overall Results');
  const keyOf = (member, sail) => entryKey_v3(series.entryType, member, sail);
  const keysIn = s => {
    const lr = s.getLastRow();
    return lr >= OVERALL_DATA_START_ROW
      ? new Set(s.getRange(OVERALL_DATA_START_ROW, 3, lr - OVERALL_DATA_START_ROW + 1, 2).getValues()
          .map(([sail, member]) => keyOf(member, sail)))
      : new Set();
  };
  const ensureRows = (s, upTo) => { if (s.getMaxRows() < upTo) s.insertRowsAfter(s.getMaxRows(), upTo - s.getMaxRows()); };
  const stripe = (s, lastRow) => {
    const body = s.getRange(OVERALL_DATA_START_ROW, 2, lastRow - OVERALL_DATA_START_ROW + 1, 6);
    s.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=ISEVEN(ROW())').setBackground('#FFF9C4').setRanges([body]).build()]);
  };

  const existing = keysIn(sh);
  const newMembers = rankedScores.filter(sc => sc.member && !existing.has(keyOf(sc.member, sc.sail)));
  if (newMembers.length === 0) return;

  console.log(`Found ${newMembers.length} new member(s) to add to Overall Results: ` + newMembers.map(m => m.member).join(', '));

  const roundColStart = 8;                                       // first round column, unaffected by row layout
  const completedRounds = Number(sh.getRange(OVERALL_META_ROW_2, 4).getValue()) || 0;     // D4 = rounds sailed
  const dncByRound = completedRounds > 0
    ? sh.getRange(OVERALL_META_ROW_1, roundColStart, 1, completedRounds).getValues()[0] : [];

  const insertAt = Math.max(sh.getLastRow(), OVERALL_DATA_START_ROW - 1) + 1;
  ensureRows(sh, insertAt + newMembers.length - 1);
  sh.getRange(insertAt, 2, newMembers.length, 6).setValues(newMembers.map(m => ['', m.sail, m.member, '', '', '']));
  if (completedRounds > 0) {
    sh.getRange(insertAt, roundColStart, newMembers.length, completedRounds).setValues(newMembers.map(() => dncByRound));
    console.log(`Backfilled ${completedRounds} round(s) with DNC for ${newMembers.length} member(s)`);
  }
  stripe(sh, sh.getLastRow());

  if (raceType === 'Handicap') {
    const hs = ss.getSheetByName('Handicaps');
    if (hs) {
      const hsExisting = keysIn(hs);
      const hsNew = newMembers.filter(m => !hsExisting.has(keyOf(m.member, m.sail)));
      if (hsNew.length > 0) {
        const hsRounds = Number(hs.getRange(OVERALL_META_ROW_2, 4).getValue()) || 0;
        const hsInsertAt = Math.max(hs.getLastRow(), OVERALL_DATA_START_ROW - 1) + 1;
        ensureRows(hs, hsInsertAt + hsNew.length - 1);
        hs.getRange(hsInsertAt, 2, hsNew.length, 6).setValues(hsNew.map(m => ['', m.sail, m.member, m.hcap || 0, '', '']));
        if (hsRounds > 0) {
          hs.getRange(hsInsertAt, roundColStart, hsNew.length, hsRounds)
            .setValues(hsNew.map(() => Array(hsRounds).fill('-')));
        }
        stripe(hs, hs.getLastRow());
        console.log(`Added ${hsNew.length} new member(s) to Handicaps sheet.`);
      }
    }
  }
  console.log('New member rows inserted and backfilled successfully.');
}

/** Marks the Event Data row Processed. The Status column is found by header, not by position. */
function markCalendarEventProcessed_v4(eventId) {
  const cfg = getConfig();
  try {
    const sheet = SpreadsheetApp.openById(cfg.calendarSpreadsheetId).getSheetByName('Event Data');
    const data = sheet.getDataRange().getValues();
    const hdr = data[0].map(x => String(x).trim().toLowerCase());
    const iStatus = hdr.indexOf('results');
    if (iStatus < 0) throw new Error("Event Data: 'Results' column not found");
    const targetId = String(eventId).trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === targetId) {                 // Column A = EventID
        sheet.getRange(i + 1, iStatus + 1).setValue('Processed');
        Logger.log(`Marked Event ID "${eventId}" as Processed at row ${i + 1}.`);
        return true;
      }
    }
    Logger.log(`Event ID "${eventId}" was not found in Event Data.`);
    return false;
  } catch (error) {
    Logger.log(`Error updating calendar for Event ID "${eventId}": ` + error.toString());
    throw new Error(`Calendar Update Failed: ${error.message}`);
  }
}