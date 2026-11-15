/**
 * roundSheet_v4.js — writes the individual Round sheet WITH its formatting and logs one archive row per
 * competitor per race.
 * v4: round number comes from parsed.roundNo (no counter); the caller (main_v4) says whether this is a correction;
 *     dates are real Date values; archive rows carry SeriesID (col 31) and Season (col 32); the round registry
 *     (storeRoundInformation_v4) is written by main_v4 as its LAST step, not here.
 * Returns { sheetID, roundNumber }.
 */
function roundWrite_v4(bookID, rankedScores, parsed, series, isCorrection) {
  if (!rankedScores || !rankedScores.length) return null;
  const racingFormat = series.resolvedFormat;
  const eventID = parsed.eventID;
  const roundNumber = Number(parsed.roundNo);
  if (!(roundNumber >= 1)) throw new Error('roundWrite_v4: invalid roundNo ' + parsed.roundNo);

  // === Archive workbook: validate BEFORE changing anything ===
  const cfg = getConfig();
  const archiveSS = SpreadsheetApp.openById(cfg.archiveWorkbookID);
  const archiveSheet = archiveSS.getSheetByName("RaceResultsArchive") || archiveSS.insertSheet("RaceResultsArchive");
  const aData = archiveSheet.getLastRow() > 0 ? archiveSheet.getDataRange().getValues() : [];
  const aHeader = aData.shift() || [];
  if (aHeader.length && (aHeader.indexOf('SeriesID') !== 30 || aHeader.indexOf('Season') !== 31))
    throw new Error('RaceResultsArchive columns 31/32 must be SeriesID and Season - run backfillSeriesSeason_v4() first.');

  if (isCorrection) console.log(`Correction for eventID ${eventID} -> Round ${roundNumber}`);
  else console.log(`New round for eventID ${eventID} -> Round ${roundNumber}`);

  const ss = SpreadsheetApp.openById(bookID);
  const workbookName = ss.getName();
  const roundSheetName = `Round ${roundNumber}`;

  // === Archive the existing sheet for this round (corrections / re-runs): "Round N Old", "Round N Old 2", ... ===
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

  sh.getRange("B4:D4").merge().setValue(parsed.dateObj).setNumberFormat(DATE_FMT_V4).setHorizontalAlignment("left");

  sh.getRange(3, totalColIdx).setValue(parsed.competitorCount).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(3, totalColIdx + 1, 1, 1).merge().setValue("Boats").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sh.getRange(4, totalColIdx).setValue(raceCount).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(4, totalColIdx + 1, 1, 1).merge().setValue("Races").setHorizontalAlignment("left").setVerticalAlignment("middle");

  // --- Archive: always remove this event's earlier rows (correction or re-run of a failed file) ---
  if (aData.length) {
    const idxEvent = aHeader.indexOf("EventID");
    if (idxEvent === -1) throw new Error('RaceResultsArchive header "EventID" not found.');
    const rowsToDelete = [];
    aData.forEach((row, i) => { if (String(row[idxEvent]).trim() === String(eventID).trim()) rowsToDelete.push(i + 2); });
    rowsToDelete.reverse().forEach(r => archiveSheet.deleteRow(r));       // bottom-up keeps indices valid
    Logger.log(`Deleted ${rowsToDelete.length} archive row(s) for EventID: ${eventID}`);
  }
  if (isCorrection) parsed.raceReport = "*** Adjusted *** " + (parsed.raceReport || "");

  // --- Round rows + archive rows ---
  const dataRows = [header];
  const archiveRows = [];
  rankedScores.forEach((sc, index) => {
    const row = [sc.rank || (index + 1), sc.sail, sc.member, sc.net];
    const boatId = sc.boatId;
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
        parsed.dateObj,
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
        "",
        parsed.seriesId,                            // col 31 SeriesID
        String(parsed.season)                       // col 32 Season
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
  console.log(`Round ${roundNumber} sheet written (EventID: ${parsed.eventID}) in ${workbookName}`);

  // --- Archive ---
  if (archiveRows.length > 0) {
    const r0 = archiveSheet.getLastRow() + 1, w = archiveRows[0].length, cnt = archiveRows.length;
    archiveSheet.getRange(r0, w, cnt, 1).setNumberFormat('@');           // Season stays text ("2026-27")
    archiveSheet.getRange(r0, 4, cnt, 1).setNumberFormat(DATE_FMT_V4);   // race date
    archiveSheet.getRange(r0, 1, cnt, w).setValues(archiveRows);
    console.log(`Round ${roundNumber} races processed to Archives (EventID: ${parsed.eventID})`);
  }

  return { sheetID, roundNumber };
}