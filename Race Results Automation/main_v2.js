/**
 * Main orchestrator for parallel v2 regatta execution.
 * Supports isDryRun flag to safely test and inspect without side-effects.
 */
function processNewRegattaSheets_v2(parsed, regattaName, fileId = null, isDryRun = false) {
  const ctx = createRoundContext(parsed, 'v2');
  ctx.log(`[v2 Execution Started] Regatta: ${regattaName} | Dry-Run: ${isDryRun}`);

  try {
    const md = getMasterData_v2();
    const regattaKey = (regattaName || parsed.regattaName || '').toString().trim().toLowerCase();
    const regattaEntry = md.regattasByName[regattaKey];

    if (!regattaEntry) {
      throw new Error(`processNewRegattaSheets_v2: Regatta configuration not found for '${regattaName}'`);
    }

    const racingFormat = regattaEntry.resolvedFormat;
    ctx.log(`Active RacingFormat: ${racingFormat.name} (ID: ${racingFormat.formatId})`);

    // 1. Build Scores with v2 isolated specs
    const currentClassData = md.classMembersMap[parsed.className] || [];
    const buildResult = buildScoresFromRaces_v2(parsed, currentClassData, racingFormat);
    if (buildResult.series) {
      ctx.log(`Participation weighting ON: ${buildResult.series.eligible} eligible starters` +
              (buildResult.series.provisional ? ' (provisional - field not frozen)' : ' (frozen)'));
    }

    // 2. Rank using placement-based tie-breakers
    const rankedScores = rankScoresMap_v2(buildResult.scores, racingFormat.scoringSystem);
    ctx.set('scores', rankedScores);
    ctx.set('updatedHandicaps', buildResult.updatedHandicaps);

    if (isDryRun) {
      ctx.log('[DRY-RUN] Calculations completed successfully. Bypassing persistent writes.');
      ctx.succeed();
      return {
        status: 'dry_run_success',
        rankedScores,
        updatedHandicaps: buildResult.updatedHandicaps,
        racingFormat
      };
    }

    // 3. Persistent Pipeline
    const overallSheetID = getOrCreateOverall_v2(parsed.regattaName, parsed, currentClassData, racingFormat);
    ctx.set('overallSheetID', overallSheetID);

    ensureMembersInOverall(overallSheetID, rankedScores, racingFormat.raceSpecs.some(s => s.raceType === 'handicap') ? 'Handicap' : 'Scratch');

    const roundResult = roundWrite_v2(overallSheetID, rankedScores, parsed, racingFormat, false);
    ctx.set('roundResult', roundResult);

    appendRound_v2(overallSheetID, parsed, rankedScores, racingFormat, false);
    appendHCRound_v2(overallSheetID, parsed, buildResult.updatedHandicaps, racingFormat, false);

    // 4. Update Handicaps in Master Sheet
    if (racingFormat.raceSpecs.some(s => s.raceType === 'handicap')) {
      updateClassMemberHandicaps(buildResult.updatedHandicaps, parsed.className);
    }

    // 5. Finalize Post & Calendar
    finalizeRaceResultsFile(parsed, overallSheetID, roundResult);

    if (parsed.eventID) {
      markCalendarEventProcessed(parsed.eventID);
    }

    if (fileId) {
      const cfg = getConfig();
      archiveProcessedFile(fileId, cfg.resultsProcessedFolderId);
    }

    ctx.succeed();
    return {
      status: 'success',
      rankedScores,
      updatedHandicaps: buildResult.updatedHandicaps
    };

  } catch (err) {
    ctx.log(`v2 Engine Error: ${err.message}\n${err.stack}`);
    ctx.fail(err);
    throw err;
  }
}