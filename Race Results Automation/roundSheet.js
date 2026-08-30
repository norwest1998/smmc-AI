/**
 * Writes the results for a single round to its own sheet in the regatta book.
 * Base version includes Discard bracket logic, UI formatting, and Config registration.
 * @param {string} bookID The ID of the target spreadsheet.
 * @param {object} rankedScores The calculated scores for the round.
 * @param {object} parsed The object containing parsed regatta data.
 */
function roundWrite(bookID, rankedScores, parsed, raceType) {
  if (!rankedScores || !rankedScores.length) return;
  const ss = SpreadsheetApp.openById(bookID);

  const eventID = parsed.eventID;

// === Determine round number and whether this is a correction ===
  
  // const existing = getCurrentRoundInfo(eventID);
  const existing = checkRoundExists(eventID);
  const isCorrection = existing !== null;

  let roundNumber;

  if (isCorrection) {
    roundNumber = existing;
    console.log(`Correction for eventID ${eventID} → reusing Round ${roundNumber}`);
  } else {
    roundNumber = getNextRoundNumber(parsed.regattaName);
    incrementRoundNumber(parsed.regattaName);
    console.log(`New round for eventID ${eventID} → Round ${roundNumber}`);
  }
  const roundSheetName = `Round ${roundNumber}`;
  const sheets = ss.getSheets();

  // 1. Find the current Round sheet
  const currentRoundSheet = ss.getSheetByName(roundSheetName);

  if (currentRoundSheet) {

    // 2. Find existing "Old" sheets for this round
    const oldSheets = sheets
      .map(s => s.getName())
      .filter(name =>
        name === `${roundSheetName} Old` ||
        name.startsWith(`${roundSheetName} Old `)
      );

    // 3. Determine next Old index
    let nextOldIndex = 1;

    if (oldSheets.length > 0) {
      const indices = oldSheets.map(name => {
        const match = name.match(/Old\s*(\d+)?$/);
        return match && match[1] ? Number(match[1]) : 1;
      });

      nextOldIndex = Math.max(...indices) + 1;
    }

    // 4. Rename and archive existing Round sheet
    const oldName =
      nextOldIndex === 1
        ? `${roundSheetName} Old`
        : `${roundSheetName} Old ${nextOldIndex}`;

    currentRoundSheet.setName(oldName);
    currentRoundSheet.hideSheet();
    console.log(`Original sheet renamed and hidden, new name ${oldName} `)
  }

  // 5. Create the new Round sheet
  const sh = ss.insertSheet(roundSheetName);
  const sheetID = sh.getSheetId();

  // --- Round Metadata ---
  const processedDate = new Date();

  // --- Compute performance stats per competitor ---
  const statsData = rankedScores.map(sc => {
    let wins = 0, podiums = 0, top5 = 0;
    sc.placements.forEach(val => {
      if (val === 1) wins++;
      if (val > 0 && val <= 3) podiums++;
      if (val > 0 && val <= 5) top5++;
    });
    return [wins, podiums, top5];
  });

  // --- Round Sheet Header ---
  const raceCount = rankedScores[0].racescore.length;
  const startRow = 7;
  const startCol = 2;
  const header = ["Pos", "Sail #", "Competitor", "Result"];
  for (let i = 1; i <= raceCount; i++) header.push(`R${i}`);
  header.push("Total", "Drop", "W", "T3", "T5");
  const totalCols = header.length;
  const totalColIdx = startCol + totalCols - 5;
  
  sh.setHiddenGridlines(true);
  // --- Metadata UI ---
  sh.getRange("B3:H3")
  .merge()
    .setValue(`${parsed.regattaName} - Round ${roundNumber}`)
    .setFontSize(16).setFontWeight("bold").setBackground("#4A86E8")
    .setFontColor("white").setHorizontalAlignment("left").setVerticalAlignment("left");

  sh.getRange("B4:D4")
  .merge()
  .setValue(parsed.date)
  .setHorizontalAlignment("left");

  sh.getRange(3, totalColIdx)
  .setValue(parsed.competitorCount)
  .setHorizontalAlignment("center")
  .setVerticalAlignment("center");
  
  sh.getRange(3, totalColIdx + 1,1,1)
    .merge()
    .setValue("Boats")
    .setHorizontalAlignment("left")
    .setVerticalAlignment("center");

  sh.getRange(4, totalColIdx)
    .setValue(raceCount)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("center");

  sh.getRange(4, totalColIdx + 1,1,1)
  .merge()
  .setValue("Races")
  .setHorizontalAlignment("left")
  .setVerticalAlignment("center");
  
  // remove archive records if a correction
  
  const cfg = getConfig();
  const cfgsheetID = cfg.archiveWorkbookID
  const archiveSS = SpreadsheetApp.openById(cfgsheetID);
  const archiveSheet = archiveSS.getSheetByName("RaceResultsArchive") || archiveSS.insertSheet("RaceResultsArchive");
  
if (isCorrection) {
  const data = archiveSheet.getDataRange().getValues();
  const archiveHeader = data.shift(); // removes header row, data is now 0-indexed body rows
  
  const idxEvent  = archiveHeader.indexOf("EventID");
  const idxRound  = archiveHeader.indexOf("SeriesRoundNumber");

  if (idxEvent === -1 || idxRound === -1) {
    Logger.log('WARNING: Archive headers not found — skipping archive cleanup.');
  } else {
    const rowsToDelete = [];

    data.forEach((row, i) => {
      if (
        String(row[idxEvent]).trim()  === String(eventID).trim() &&
        Number(row[idxRound])         === Number(roundNumber)
      ) {
        rowsToDelete.push(i + 2); // +2 because we shifted the header (body is 1-indexed, +1 for header)
      }
    });

    // Delete bottom-up so row indices stay valid as rows are removed
    rowsToDelete.reverse().forEach(r => archiveSheet.deleteRow(r));
    Logger.log(`Deleted ${rowsToDelete.length} archive row(s) for EventID: ${eventID}, Round: ${roundNumber}`);
  }

  parsed.raceReport = "*** Adjusted *** " + parsed.raceReport;
}

  // --- Populate Round Sheet & Build Archive Rows ---
  const dataRows = [header];
  const archiveRows = [];
  rankedScores.forEach((sc, index) => {
    const row = [index + 1, sc.sail, sc.member, sc.net];
    sc.placements.forEach((p, rIdx) => {
      const val = (sc.discards && sc.discards[rIdx] === true) ? "'(" + p + ")" : p;
      row.push(val);

      // --- Archive row per competitor per race ---
      archiveRows.push([
        parsed.eventID,
        parsed.regattaName || "",
        raceType,
        parsed.date,
        processedDate,
        roundNumber,
        parsed.className || "",
        parsed.competitorCount,
        sc.boatID || "",
        sc.member || "",
        sc.sail || "",
        rIdx + 1, // race number within round
        sc.placements[rIdx],        // race placing
        sc.racescore[rIdx],         // points for this race
        (sc.discards[rIdx] === true) ? sc.racescore[rIdx] : 0,
        sc.racescore[rIdx],
        (sc.discards[rIdx] === true) ? sc.racescore[rIdx] : 0,
        (sc.discards[rIdx] === true) ? 0 : sc.racescore[rIdx],
        "", "", "", "", "", "",
        ((sc.gross - sc.net) / (sc.net || 1)),            // discard dependency
        ((typeof sc.placements[rIdx] === 'number') ? sc.placements[rIdx] : parsed.competitorCount / parsed.competitorCount)  * 100,              // percentile
        (sc.placements[rIdx] <= 3) ? 1 : 0,               // podiums
        parsed.competitorCount,
        true,
        ""
      ]);
    });

    row.push(sc.gross, sc.gross - sc.net, ...statsData[index]);
    dataRows.push(row);
  });

  // --- Write Round Sheet ---
  sh.getRange(startRow, startCol, dataRows.length, totalCols).setValues(dataRows);
  const lastRow = startRow + dataRows.length - 1;
  const lastCol = startCol + totalCols - 1;
  if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  if (sh.getMaxColumns() > lastCol) sh.deleteColumns(lastCol + 1, sh.getMaxColumns() - lastCol);

  applyRoundCardFormatting(sh);

  // === Update metadata — overwrites previous entry for this eventID ===
  storeRoundInformation(parsed.regattaName, eventID, roundNumber, {
    sheetID: sheetID,
    raceDate : parsed.date,
    className : parsed.className,
    competitorCount : parsed.competitorCount,
    note: isCorrection ? `Corrected on ${new Date().toISOString().split('T')[0]}` : ""
  });

  console.log(`Round ${roundNumber} processed successfully (EventID: ${parsed.eventID})`);

  // --- Write Archive Sheet ---
  archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, archiveRows.length, archiveRows[0].length)
              .setValues(archiveRows);
  console.log(`Round ${roundNumber} races processed to Archives (EventID: ${parsed.eventID})`);

return { sheetID, roundNumber };
}
