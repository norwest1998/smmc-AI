/**
 * roundSheet_v3.js — writes the individual Round sheet WITH its formatting (title banner, date, boats / races
 * counts, hidden gridlines, trimmed rows/columns, applyRoundCardFormatting) and logs one archive row per
 * competitor per race, with the race's own RaceSpec type. Name comes from the SERIES (parsed.regattaName).
 * Replaces roundWrite_v2, which dropped the v1 formatting.
 */
function roundWrite_v3(bookID, rankedScores, parsed, series, isDryRun = false) {
  if (!rankedScores || !rankedScores.length) return null;
  const racingFormat = series.resolvedFormat;
  const eventID = parsed.eventID;

  // === Round number, and whether this is a correction ===
  const existing = checkRoundExists(eventID);
  const isCorrection = existing !== null && existing !== undefined && existing !== false && existing !== 0 && existing !== '';
  const roundNumber = isCorrection ? existing : getNextRoundNumber(parsed.regattaName);

  if (isDryRun) {
    Logger.log(`[DRY-RUN] Bypassing round sheet creation and archive append for Round ${roundNumber}`);
    return { sheetID: 'DRY_RUN_SHEET_ID', roundNumber };
  }
  if (isCorrection) console.log(`Correction for eventID ${eventID} -> reusing Round ${roundNumber}`);
  else { incrementRoundNumber(parsed.regattaName); console.log(`New round for eventID ${eventID} -> Round ${roundNumber}`); }

  const ss = SpreadsheetApp.openById(bookID);
  const workbookName = ss.getName();
  const roundSheetName = `Round ${roundNumber}`;

  // === Archive the existing sheet for this round (corrections): "Round N Old", "Round N Old 2", ... ===
  const currentRoundSheet = ss.getSheetByName(roundSheetName);
  if (currentRoundSheet) {
    const oldSheets = ss.getSheets().map(s => s.getName())
      .filter(name => name === `${roundSheetName} Old` || name.startsWith(`${roundSheetName} Old `));
    let nextOldIndex = 1;
    if (oldSheets.length > 0) {
      const indices = oldSheets.map(name => { const m = name.match(/Old\s*(\d+)?$/); return m && m[1] ? Number(m[1]) : 1; });
      nextOldIndex = Math.max(...indices) + 1;
    }
    const oldName = nextOldIndex === 1 ? `${roundSheetName} Old` : `${roundSheetName} Old ${nextOldIndex}`;
    currentRoundSheet.setName(oldName);
    currentRoundSheet.hideSheet();
    console.log(`Original sheet renamed and hidden, new name ${oldName}`);
  }

  // === New round sheet ===
  const sh = ss.insertSheet(roundSheetName);
  const sheetID = sh.getSheetId();
  const processedDate = new Date();

  const raceCount = rankedScores[0].racescore.length;
  const activeRaceSpecs = expandRaceSpecs_v2(racingFormat.raceSpecs || [], raceCount);

  // --- Layout: header on row 7, starting at column B ---
  const startRow = 7, startCol = 2;
  const header = ["Pos", "Sail #", "Competitor", "Result"];
  for (let i = 1; i <= raceCount; i++) header.push(`R${i}`);
  header.push("Total", "Drop", "W", "T3", "T5");
  const totalCols = header.length;
  const totalColIdx = startCol + totalCols - 5;           // the "Total" column

  sh.setHiddenGridlines(true);

  // --- Metadata banner ---
  sh.getRange("B3:H3").merge()
    .setValue(`${parsed.regattaName} - Round ${roundNumber}`)
    .setFontSize(16).setFontWeight("bold").setBackground("#4A86E8")
    .setFontColor("white").setHorizontalAlignment("left").setVerticalAlignment("middle");

  sh.getRange("B4:D4").merge().setValue(parsed.date).setHorizontalAlignment("left");

  sh.getRange(3, totalColIdx).setValue(parsed.competitorCount).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(3, totalColIdx + 1, 1, 1).merge().setValue("Boats").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sh.getRange(4, totalColIdx).setValue(raceCount).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(4, totalColIdx + 1, 1, 1).merge().setValue("Races").setHorizontalAlignment("left").setVerticalAlignment("middle");

  // --- Archive workbook: remove this round's old records when correcting ---
  const cfg = getConfig();
  const archiveSS = SpreadsheetApp.openById(cfg.archiveWorkbookID);
  const archiveSheet = archiveSS.getSheetByName("RaceResultsArchive") || archiveSS.insertSheet("RaceResultsArchive");

  if (isCorrection) {
    const data = archiveSheet.getDataRange().getValues();
    const archiveHeader = data.shift();
    const idxEvent = archiveHeader.indexOf("EventID");
    const idxRound = archiveHeader.indexOf("SeriesRoundNumber");
    if (idxEvent === -1 || idxRound === -1) {
      Logger.log('WARNING: Archive headers not found - skipping archive cleanup.');
    } else {
      const rowsToDelete = [];
      data.forEach((row, i) => {
        if (String(row[idxEvent]).trim() === String(eventID).trim() && Number(row[idxRound]) === Number(roundNumber)) rowsToDelete.push(i + 2);
      });
      rowsToDelete.reverse().forEach(r => archiveSheet.deleteRow(r));       // bottom-up keeps indices valid
      Logger.log(`Deleted ${rowsToDelete.length} archive row(s) for EventID: ${eventID}, Round: ${roundNumber}`);
    }
    parsed.raceReport = "*** Adjusted *** " + (parsed.raceReport || "");
  }

  // --- Round rows + archive rows ---
  const dataRows = [header];
  const archiveRows = [];
  rankedScores.forEach((sc, index) => {
    const row = [sc.rank || (index + 1), sc.sail, sc.member, sc.net];
    const boatId = getBoatId(sc.sail, sc.member, parsed.className);
    let wins = 0, podiums = 0, top5 = 0;

    sc.placements.forEach((p, rIdx) => {
      if (p === 1) wins++;
      if (p > 0 && p <= 3) podiums++;
      if (p > 0 && p <= 5) top5++;

      row.push((sc.discards && sc.discards[rIdx] === true) ? "'(" + p + ")" : p);

      const specType = activeRaceSpecs[rIdx] ? activeRaceSpecs[rIdx].raceType : 'scratch';
      const dropped = sc.discards && sc.discards[rIdx] === true;
      archiveRows.push([
        parsed.eventID,
        parsed.regattaName || "",
        specType,                                   // the race's own type from its RaceSpec
        parsed.date,
        processedDate,
        roundNumber,
        parsed.className || "",
        parsed.competitorCount,
        boatId || "",
        sc.sail || "",
        sc.member || "",
        rIdx + 1,
        sc.placements[rIdx],
        sc.racescore[rIdx],
        dropped ? sc.racescore[rIdx] : 0,
        sc.racescore[rIdx],
        dropped ? sc.racescore[rIdx] : 0,
        dropped ? 0 : sc.racescore[rIdx],
        "", "", "", "", "", "",
        (sc.gross - sc.net) / (sc.net || 1),
        ((typeof sc.placements[rIdx] === 'number') ? sc.placements[rIdx] : parsed.competitorCount) / parsed.competitorCount * 100,
        (sc.placements[rIdx] <= 3) ? 1 : 0,
        parsed.competitorCount,
        true,
        ""
      ]);
    });

    row.push(sc.gross, sc.gross - sc.net, wins, podiums, top5);
    dataRows.push(row);
  });

  // --- Write, trim, format ---
  sh.getRange(startRow, startCol, dataRows.length, totalCols).setValues(dataRows);
  const lastRow = startRow + dataRows.length - 1;
  const lastCol = startCol + totalCols - 1;
  if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  if (sh.getMaxColumns() > lastCol) sh.deleteColumns(lastCol + 1, sh.getMaxColumns() - lastCol);

  applyRoundCardFormatting(sh);

  // --- Round metadata (overwrites any previous entry for this eventID) ---
  storeRoundInformation(parsed.regattaName, eventID, roundNumber, {
    sheetID: sheetID,
    raceDate: parsed.date,
    className: parsed.className,
    competitorCount: parsed.competitorCount,
    note: isCorrection ? `Corrected on ${new Date().toISOString().split('T')[0]}` : ""
  });
  console.log(`Round ${roundNumber} processed successfully (EventID: ${parsed.eventID}) in ${workbookName}`);

  // --- Archive ---
  if (archiveRows.length > 0) {
    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, archiveRows.length, archiveRows[0].length).setValues(archiveRows);
    console.log(`Round ${roundNumber} races processed to Archives (EventID: ${parsed.eventID})`);
  }

  return { sheetID, roundNumber };
}