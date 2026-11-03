/**
 * Main orchestrator for the v3 results pipeline — driven by the SERIES sheet.
 *
 * parsed.seriesId should be set by the results parser from Event Data.SeriesID.
 * (Fallbacks: Event Data lookup by event id, then SeriesName match on parsed.regattaName.)
 * Series decides: class, racing format + specs, scoring system, discards, weighting,
 * entry type (Member | Boat) and whether handicaps are tracked. Regatta Type is not used.
 * Round sheets are written (and formatted) by roundWrite_v3.
 */
function processNewRegattaSheets_v3(parsed, fileId = null, isDryRun = false) {
  const ctx = createRoundContext(parsed, 'v3');
  ctx.log(`[v3 Execution Started] eventID=${parsed.eventID} | Dry-Run: ${isDryRun}`);

  try {
    const md = getMasterData_v3();
    const series = resolveSeries_v3(parsed, md);
    applySeriesToParsed_v3(parsed, series);
    const fmt = series.resolvedFormat;
    ctx.log(`Series: ${series.name} (${series.id}) | class=${parsed.className} | format=${fmt.name} (${fmt.formatId}) | ` +
            `${fmt.scoringSystem} | weighting=${fmt.weightingFormat} | entry=${series.entryType} | hcapTracking='${series.handicapTracking}'`);

    if (!fmt.active) ctx.log('WARNING: this racing format is archived.');
    if (fmt.allowedClassIds.length) {
      const cls = md.classes.find(c => String(c.classname).trim().toLowerCase() === parsed.className.toLowerCase());
      if (cls && fmt.allowedClassIds.indexOf(String(cls.classId).trim()) === -1)
        ctx.log(`WARNING: class ${parsed.className} is not in the format's valid classes.`);
    }

    // 1. Score
    let roster = rosterForSeries_v3(md, series);
    roster = overlayStartingHandicaps_v3(series, roster);        // tracked series: start from SeriesEntries.StartingHandicap
    const buildResult = buildScoresFromRaces_v3(parsed, roster, series);
    if (buildResult.series) {
      ctx.log(`Participation weighting ON: ${buildResult.series.eligible} eligible starters` +
              (buildResult.series.provisional ? ' (provisional - field not frozen)' : ' (frozen)'));
    }

    // 2. Rank
    const rankedScores = rankScoresMap_v2(buildResult.scores, fmt.scoringSystem);
    ctx.set('scores', rankedScores);
    ctx.set('updatedHandicaps', buildResult.updatedHandicaps);

    if (isDryRun) {
      ctx.log('[DRY-RUN] Calculations completed. No writes performed.');
      ctx.succeed();
      return { status: 'dry_run_success', series, rankedScores, updatedHandicaps: buildResult.updatedHandicaps };
    }

    // 3. Persist
    const overallSheetID = getOrCreateOverall_v3(series, parsed, roster);
    ctx.set('overallSheetID', overallSheetID);

    const trackHcap = hasHandicapSheet_v3(series);
    ensureMembersInOverall(overallSheetID, rankedScores, trackHcap ? 'Handicap' : 'Scratch');

    const roundResult = roundWrite_v3(overallSheetID, rankedScores, parsed, series, false);
    ctx.set('roundResult', roundResult);

    appendRound_v3(overallSheetID, parsed, rankedScores, series, roundResult.roundNumber, false);
    applySeriesFormatting(ctx.overallSheetID, 'Overall Results');
    appendHCRound_v3(overallSheetID, parsed, buildResult.updatedHandicaps, series, roundResult.roundNumber, false);
    applySeriesFormatting(ctx.overallSheetID, 'Handicaps');

    // 4. HandicapTracking = 'Series': handicaps live in the SeriesEntries sheet (not the master ClassMembers)
    if (trackHcap) {
      const n = syncSeriesEntryHandicaps_v3(series, overallSheetID, buildResult.updatedHandicaps, md);
      ctx.log(`SeriesEntries handicaps updated for ${n} entr${n === 1 ? 'y' : 'ies'}`);
    }

    // 5. Finalise
    finalizeRaceResultsFile(parsed, overallSheetID, roundResult);
    if (parsed.eventID) markCalendarEventProcessed(parsed.eventID);
    if (fileId) archiveProcessedFile(fileId, getConfig().resultsProcessedFolderId);

    ctx.succeed();
    return { status: 'success', series, rankedScores, updatedHandicaps: buildResult.updatedHandicaps };

  } catch (err) {
    ctx.log(`v3 Engine Error: ${err.message}\n${err.stack}`);
    ctx.fail(err);
    throw err;
  }
}