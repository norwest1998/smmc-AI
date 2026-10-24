/**
 * Writes the individual round sheet and logs granular, race-specific RaceSpec types to the Archive.
 */
function roundWrite_v2(bookID, rankedScores, parsed, racingFormat, isDryRun = false) {
  if (!rankedScores || !rankedScores.length) return null;

  const eventID = parsed.eventID;
  const existing = checkRoundExists(eventID);
  const isCorrection = existing !== null;

  let roundNumber = isCorrection ? existing : getNextRoundNumber(parsed.regattaName);

  if (isDryRun) {
    Logger.log(`[DRY-RUN] Bypassing round sheet creation and archive append for Round ${roundNumber}`);
    return { sheetID: 'DRY_RUN_SHEET_ID', roundNumber };
  }

  if (!isCorrection) {
    incrementRoundNumber(parsed.regattaName);
  }

  const ss = SpreadsheetApp.openById(bookID);
  const roundSheetName = `Round ${roundNumber}`;

  // Archive existing sheet if correction
  const currentSheet = ss.getSheetByName(roundSheetName);
  if (currentSheet) {
    const oldSheets = ss.getSheets()
      .map(s => s.getName())
      .filter(n => n === `${roundSheetName} Old` || n.startsWith(`${roundSheetName} Old `));
    const nextOldIndex = oldSheets.length + 1;
    currentSheet.setName(`${roundSheetName} Old ${nextOldIndex}`);
    currentSheet.hideSheet();
  }

  const sh = ss.insertSheet(roundSheetName);
  const sheetID = sh.getSheetId();

  const raceCount = rankedScores[0].racescore.length;
  const activeRaceSpecs = expandRaceSpecs_v2(racingFormat.raceSpecs || [], raceCount);
  const processedDate = new Date();

  // Clean prior records in RaceResultsArchive if correction
  const cfg = getConfig();
  const archiveSS = SpreadsheetApp.openById(cfg.archiveWorkbookID);
  const archiveSheet = archiveSS.getSheetByName("RaceResultsArchive") || archiveSS.insertSheet("RaceResultsArchive");

  if (isCorrection) {
    const data = archiveSheet.getDataRange().getValues();
    const header = data.shift();
    const idxEvent = header.indexOf("EventID");
    const idxRound = header.indexOf("SeriesRoundNumber");

    if (idxEvent !== -1 && idxRound !== -1) {
      const rowsToDelete = [];
      data.forEach((row, i) => {
        if (String(row[idxEvent]).trim() === String(eventID).trim() && Number(row[idxRound]) === Number(roundNumber)) {
          rowsToDelete.push(i + 2);
        }
      });
      rowsToDelete.reverse().forEach(r => archiveSheet.deleteRow(r));
    }
  }

  // Populate Round Sheet
  const header = ["Pos", "Sail #", "Competitor", "Result"];
  for (let i = 1; i <= raceCount; i++) header.push(`R${i}`);
  header.push("Total", "Drop", "W", "T3", "T5");

  const dataRows = [header];
  const archiveRows = [];

  rankedScores.forEach((sc, index) => {
    const row = [sc.rank || (index + 1), sc.sail, sc.member, sc.net];
    const boatId = getBoatId(sc.sail, sc.member, parsed.className);

    sc.placements.forEach((p, rIdx) => {
      const val = (sc.discards && sc.discards[rIdx] === true) ? `'(${p})` : p;
      row.push(val);

      // Map EXACT race type from individual child RaceSpec
      const specType = activeRaceSpecs[rIdx] ? activeRaceSpecs[rIdx].raceType : 'scratch';

      archiveRows.push([
        parsed.eventID,
        parsed.regattaName || "",
        specType, // Granular raceType instead of entire regatta label
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
        sc.discards[rIdx] ? sc.racescore[rIdx] : 0,
        sc.racescore[rIdx],
        sc.discards[rIdx] ? sc.racescore[rIdx] : 0,
        sc.discards[rIdx] ? 0 : sc.racescore[rIdx],
        "", "", "", "", "", "",
        (sc.gross - sc.net) / (sc.net || 1),
        ((typeof sc.placements[rIdx] === 'number') ? sc.placements[rIdx] : parsed.competitorCount) / parsed.competitorCount * 100,
        (sc.placements[rIdx] <= 3) ? 1 : 0,
        parsed.competitorCount,
        true,
        ""
      ]);
    });

    let wins = 0, podiums = 0, top5 = 0;
    sc.placements.forEach(val => {
      if (val === 1) wins++;
      if (val > 0 && val <= 3) podiums++;
      if (val > 0 && val <= 5) top5++;
    });

    row.push(sc.gross, sc.gross - sc.net, wins, podiums, top5);
    dataRows.push(row);
  });

  sh.getRange(7, 2, dataRows.length, header.length).setValues(dataRows);
  if (archiveRows.length > 0) {
    archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, archiveRows.length, archiveRows[0].length).setValues(archiveRows);
  }

  storeRoundInformation(parsed.regattaName, eventID, roundNumber, {
    sheetID,
    raceDate: parsed.date,
    className: parsed.className,
    competitorCount: parsed.competitorCount
  });

  return { sheetID, roundNumber };
}