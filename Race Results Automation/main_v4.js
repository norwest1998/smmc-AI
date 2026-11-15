function processNewRegattaSheets_v4(parsed, fileId = null, isDryRun = false) {
  const ctx = createRoundContext(parsed, 'v4');
  ctx.log(`[v4 Started] eventID=${parsed.eventID} | Dry-Run: ${isDryRun}`);
  try {
    // 0. Contract + round check - no fallbacks
    const md = getMasterData_v3();
    const series = validateResultsFile_v4(parsed, md);
    applySeriesToParsed_v3(parsed, series);
    const season = String(parsed.season).trim(), roundNo = Number(parsed.roundNo), fmt = series.resolvedFormat;
    const rv = validateRound_v4({ eventID: parsed.eventID, seriesId: series.id, season, roundNo });
    const isCorrection = rv.status === 'correction';
    ctx.log(`${series.name} (${series.id}) ${season} Round ${roundNo} | ${rv.status} | ${fmt.name}`);

    // 1. Score
    let roster = rosterForSeries_v3(md, series);
    roster = overlayStartingHandicaps_v3(series, roster);
    const buildResult = buildScoresFromRaces_v4(parsed, roster, series);
    const rankedScores = rankScoresMap_v2(buildResult.scores, fmt.scoringSystem);
    ctx.set('scores', rankedScores); ctx.set('updatedHandicaps', buildResult.updatedHandicaps);
    if (isDryRun) { ctx.log('[DRY-RUN] No writes performed.'); ctx.succeed();
      return { status: 'dry_run_success', series, rankedScores, updatedHandicaps: buildResult.updatedHandicaps }; }

    // 2. Persist (every step overwrites by round, so a failed file is fixed by re-running it)
    const bookId = getOrCreateOverall_v4(series, parsed, roster, season, rv.seriesRounds);
    ctx.set('overallSheetID', bookId);
    const trackHcap = hasHandicapSheet_v3(series);
    ensureMembersInOverall_v4(bookId, rankedScores, trackHcap ? 'Handicap' : 'Scratch', series);
    const roundResult = roundWrite_v4(bookId, rankedScores, parsed, series, isCorrection);
    ctx.set('roundResult', roundResult);
    appendRound_v4(bookId, parsed, rankedScores, series);
    applySeriesFormatting(ctx.overallSheetID, 'Overall Results');
    appendHCRound_v4(bookId, parsed, buildResult.updatedHandicaps, series);
    applySeriesFormatting(ctx.overallSheetID, 'Handicaps');
    if (trackHcap) {
      const n = syncSeriesEntryHandicaps_v3(series, bookId, buildResult.updatedHandicaps, md);
      ctx.log(`SeriesEntries handicaps updated for ${n} entr${n === 1 ? 'y' : 'ies'}`);
    }

    // 3. Registry last: "stored" means fully processed
    storeRoundInformation_v4({ regattaName: series.name, eventID: parsed.eventID, roundNumber: roundNo, sheetID: roundResult.sheetID,
      raceDate: parsed.date, className: parsed.className, competitorCount: parsed.competitorCount, seriesId: series.id, season });

    // 4. Finalise
    finalizeRaceResultsFile(parsed, bookId, roundResult);
    markCalendarEventProcessed_v4(parsed.eventID);
    if (fileId) archiveProcessedFile(fileId, getConfig().resultsProcessedFolderId);
    ctx.succeed();
    return { status: 'success', series, rankedScores, updatedHandicaps: buildResult.updatedHandicaps };
  } catch (err) { ctx.log(`v4 Engine Error: ${err.message}\n${err.stack}`); ctx.fail(err); throw err; }
}