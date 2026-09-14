/**
 * Orchestrator
 * Parsing now performed in Race Results Scheduler
 */
function processNewRegattaSheets(parsed, raceType) {
  const ctx = createRoundContext(parsed, raceType);

  try {
    const md = getMasterData();

    if (!ctx.parsed.eventID) {
      ctx.parsed.date = new Date(ctx.parsed.date);
      const officialEventID = lookupEventID(ctx.parsed.date, ctx.parsed.className);

      if (officialEventID) {
        ctx.parsed.eventID = officialEventID;
      } else {
        throw new Error(
          `No EventID found for ${ctx.parsed.className} on ${ctx.parsed.date} and no fallback filename available.`
        );
      }
    }

    ctx.log(`Class: ${ctx.parsed.className} Race Type: ${ctx.raceType}`);

    // 1. Build scores
    const currentClassData = md.classMembersMap[ctx.parsed.className];
    const result = buildScoresFromRaces(ctx.parsed, currentClassData, ctx.raceType);
    ctx.set('scores', result.scores);
    ctx.set('updatedHandicaps', result.updatedHandicaps);

    // 2. Get or Create the Overall Results Sheet
    ctx.set('overallSheetID', getOrCreateOverall(ctx.parsed.regattaName, ctx.parsed, currentClassData, ctx.raceType));

    // 3. Create the round sheet (tracked so it can be rolled back)
    const roundResult = roundWrite(ctx.overallSheetID, result.scores, ctx.parsed, ctx.raceType);
    ctx.set('roundResult', roundResult);
    ctx.markCreated('roundSheet', { bookID: ctx.overallSheetID, sheetName: `Round ${roundResult.roundNumber}` });

    // 4. Ensure new members exist before appending scores
    ensureMembersInOverall(ctx.overallSheetID, result.scores, ctx.raceType);

    // 5. Append round to Overall Results (triggers series recalc)
    appendRound(ctx.overallSheetID, ctx.parsed, result.scores);
    applySeriesFormatting(ctx.overallSheetID, 'Overall Results');

    // 6. Append round to Handicaps sheet
    if (ctx.raceType === 'Handicap') {
      appendHCRound(ctx.overallSheetID, ctx.parsed, result.updatedHandicaps);
      applySeriesFormatting(ctx.overallSheetID, 'Handicaps');
    }

    // 7. Schedule Facebook post
    finalizeRaceResultsFile(ctx.parsed, ctx.overallSheetID, roundResult);

    ctx.succeed();
    return "Success";

  } catch (e) {
    ctx.fail(e);
    rollbackRoundContext(ctx);
    throw e; // propagate so doPost reports failure to caller
  }
}

/**
 * Undo partial writes on failure. Currently only the round sheet is
 * safely reversible (it's newly created); Overall Results mutations
 * happen after roundWrite and are logged for manual review if they fail.
 */
function rollbackRoundContext(ctx) {
  const created = ctx.created.roundSheet;
  if (!created) return;

  try {
    const ss = SpreadsheetApp.openById(created.bookID);
    const sheet = ss.getSheetByName(created.sheetName);
    if (sheet) {
      ss.deleteSheet(sheet);
      ctx.log(`Rollback: deleted incomplete sheet "${created.sheetName}"`);
    }
  } catch (rollbackErr) {
    ctx.log(`Rollback FAILED for "${created.sheetName}": ${rollbackErr.message}`);
  }
}

/**
 * schedule Facebook post.
 */
function finalizeRaceResultsFile(parsed, overallSheetID, roundResult) {
  const cfg = getConfig();

  try {
    const fbQueueSheetId = cfg.facebookQueueSheetId;
    if (!fbQueueSheetId) {
      console.log('WARNING: Facebook queue sheet ID not configured. Post skipped.');
      return;
    }

    const overallSS = SpreadsheetApp.openById(overallSheetID);
    const roundSheetName = `Round ${roundResult.roundNumber}`;
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

    console.log(`${parsed.regattaName} Round ${roundResult.roundNumber} scheduled for Facebook post.`);
  } catch (e) {
    // Non-fatal: results are already committed, FB post is best-effort
    console.log(`WARNING: Failed to schedule Facebook post. Error: ${e.message}`);
  }
}