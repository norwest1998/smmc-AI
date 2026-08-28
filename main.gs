/**
* Orchestrator
* Parsing now performed in Race Results Scheduler
*/
function processNewRegattaSheets(parsed, raceType) {
  // get config data
  const md = getMasterData();

  // After getting parsed (from sheet or Gemini image)
  if(!parsed.eventID) {
    parsed.date = new Date(parsed.date); // Ensure it's a Date object

    // Lookup official EventID
    const officialEventID = lookupEventID(parsed.date, parsed.className);

    if (officialEventID) {
      parsed.eventID = officialEventID;
    } else {
      // Fallback: use filename or generated (as before)
      // But now you'll get a warning in logs for manual review
      console.log("No Event ID found, filename used")
      parsed.eventID = file.getName().replace(/\.[^.]+$/, '');
    }
  }

  Logger.log("Class: " + parsed.className + " Race Type: " + raceType);

  //try {

  // 1. Parse the new sheet/file (returns raw data with sail numbers)
  let currentClassData = md.classMembersMap[parsed.className];

  // 2. Build scores
  const result = buildScoresFromRaces(parsed, currentClassData, raceType);

  // 3. Get or Create the Overall Results Sheet, scoping by Regatta Name
  const overallSheetID = getOrCreateOverall(parsed.regattaName, parsed, currentClassData, raceType); 

  // 4. Create the round sheet
  const roundResult = roundWrite(overallSheetID, result.scores, parsed, raceType);

  // ✅ 5. NEW FIX: Ensure any new members are in the Overall sheet before appending scores
  ensureMembersInOverall(overallSheetID, result.scores, raceType);

  // 6. Add round to the Overall REsults sheet (and trigger series recalc)
  appendRound(overallSheetID, parsed, result.scores);
  applySeriesFormatting(overallSheetID, 'Overall Results');

  // 7. Add round to the Handicaps sheet
  if (raceType === 'Handicap') {
    appendHCRound(overallSheetID, parsed, result.updatedHandicaps);
    applySeriesFormatting(overallSheetID, 'Handicaps');
  }

  // 6. Mark the file as processed
  finalizeRaceResultsFile(parsed, overallSheetID, roundResult);

  //} 
  //  catch (e) {
  //  Logger.log(`ERROR processing file ${file.getName()}: ${e.message}`);
  //}

  return "Success";
}

/**
 * schedule Facebook post.
 */
function finalizeRaceResultsFile(parsed, overallSheetID, roundResult) {
  const cfg = getConfig();

  // 3. Schedule Facebook post now that everything has been written successfully
  try {
    const fbQueueSheetId = cfg.facebookQueueSheetId;
    if (!fbQueueSheetId) {
      Logger.log('WARNING: Facebook queue sheet ID not configured. Post skipped.');
      return;
    }

    const overallSS = SpreadsheetApp.openById(overallSheetID);
    const roundSheetName = `Round ${roundResult.roundNumber}`;
    const roundSheet = overallSS.getSheetByName(roundSheetName);

    const fb = SpreadsheetApp.openById(fbQueueSheetId);
    const queue = fb.getSheetByName('Queue');

    queue.appendRow([
      'PENDING',
      overallSheetID,
      roundResult.sheetID,
      overallSS.getName(),
      roundSheetName,
      parsed.regattaName,
      parsed.date,
      parsed.raceReport,
      new Date(),
      '', '', '', ''
    ]);

    Logger.log(`${parsed.regattaName} Round ${roundResult.roundNumber} scheduled for Facebook post.`);
  } catch (e) {
    Logger.log(`WARNING: Failed to schedule Facebook post. Error: ${e.message}`);
  }
}
