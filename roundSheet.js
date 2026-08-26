/**
 * Writes the results for a single round to its own sheet in the regatta book.
 * Base version includes Discard bracket logic, UI formatting, and Config registration.
 * @param {string} bookID The ID of the target spreadsheet.
 * @param {object} rankedScores The calculated scores for the round.
 * @param {object} parsed The object containing parsed regatta data.
 */
function roundWrite(bookID, rankedScores, parsed) {
  if (!rankedScores || !rankedScores.length) return;
  const ss = SpreadsheetApp.openById(bookID);

  const eventID = parsed.eventID;

// === Determine round number and whether this is a correction ===
  const existing = getCurrentRoundInfo(eventID);
  const isCorrection = existing !== null;

  let roundNumber;

  if (isCorrection) {
    roundNumber = existing.roundNumber;
    Logger.log(`Correction for eventID ${eventID} → reusing Round ${roundNumber}`);
  } else {
    roundNumber = getNextRound();
    incrementNextRound();
    Logger.log(`New round for eventID ${eventID} → Round ${roundNumber}`);
  }

  const roundSheetName = `Round ${roundNumber}`;

  // === Create the new round sheet ===
  let roundSheet = ss.getSheetByName(roundSheetName);

  if (roundSheet) {
    // This only happens on correction: archive the old one first
    roundSheet.setName(`${roundSheetName} (old)`);
    roundSheet.hideSheet();
  }

  // Create fresh sheet for current results
  sh = ss.insertSheet(roundSheetName);
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
  header.push("Total", "Discard", "Wins", "Podiums", "Top 5");
  const totalCols = header.length;
  const totalColIdx = startCol + totalCols - 5;

  // --- Metadata UI ---
  sh.getRange("C3:H3").merge()
    .setValue(`${parsed.regattaName} - Round ${roundNumber}`)
    .setFontSize(16).setFontWeight("bold").setBackground("#4A86E8")
    .setFontColor("white").setHorizontalAlignment("left").setVerticalAlignment("middle");

  sh.getRange("C4:D4").merge()
    .setValue(parsed.date).setFontStyle("italic").setHorizontalAlignment("left");

  sh.getRange(3, totalColIdx).setValue(parsed.competitorCount).setHorizontalAlignment("center");
  sh.getRange(3, totalColIdx + 1).setValue("Boats").setHorizontalAlignment("left");
  sh.getRange(4, totalColIdx).setValue(raceCount).setHorizontalAlignment("center");
  sh.getRange(4, totalColIdx + 1).setValue("Races").setHorizontalAlignment("left");

  // --- Populate Round Sheet & Build Archive Rows ---
  const dataRows = [header];
  const archiveRows = [];
  rankedScores.forEach((sc, index) => {
    var raceType = 'Scratch';
    const row = [index + 1, sc.sail, sc.member, sc.net];
    sc.placements.forEach((p, rIdx) => {
      if((parsed.regattaName === 'IOM Racing' && index > 2) || (parsed.regattaName.includes('Handicap'))) {
        raceType = 'Handicap'; 
      }
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

  applyRoundCardFormatting(sh, startRow, dataRows.length, totalCols);

  // === Update metadata — overwrites previous entry for this eventID ===
  addOrUpdateProcessedRound({
    eventID,
    roundNumber,
    sheetID,
    raceDate : parsed.date,
    regattaName : parsed.regattaName,
    className : parsed.className,
    competitorCount : parsed.competitorCount,
    note: isCorrection ? `Corrected on ${new Date().toISOString().split('T')[0]}` : ""
  });

  Logger.log(`Round ${roundNumber} processed successfully (EventID: ${parsed.eventID})`);

  const cfg = getConfig();
  const cfgsheetID = cfg.archiveWorkbookID

  // --- Write Archive Sheet ---
  const archiveSS = SpreadsheetApp.openById(cfgsheetID);
  const archiveSheet = archiveSS.getSheetByName("RaceResultsArchive") || archiveSS.insertSheet("RaceResultsArchive");

  archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, archiveRows.length, archiveRows[0].length)
              .setValues(archiveRows);
  Logger.log(`Round ${roundNumber} races processed to Archives (EventID: ${parsed.eventID})`);
  
  if(isCorrection){
    const data = archiveSheet.getDataRange().getValues();

    const header = data.shift();
    const idxEvent = header.indexOf("EventID");
    const idxRound = header.indexOf("SeriesRoundNumber");
    const idxProcessed = header.indexOf("ProcessedDate");

    const rowsToDelete = [];

    data.forEach((row, i) => {
      if (
        row[idxEvent] === eventID &&
        row[idxRound] === roundNumber &&
        row[idxProcessed] !== processedDate
      ) {
        rowsToDelete.push(i + 2); // sheet row index
      }
    });

    rowsToDelete.reverse().forEach(r => sh.deleteRow(r));
    Logger.log(`Round ${roundNumber} duplicates successfully deleted (EventID: ${eventID})`);
  }

  // 6. publish round to Facebook, doing it here because we have teh sheetID
  //  postRoundToFacebook(parsed, bookID, sheetID);

  return sheetID;
}
