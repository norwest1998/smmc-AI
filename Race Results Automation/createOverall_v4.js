function getOrCreateOverall_v4(series, parsed, members, season, priorRounds) {
  const cell = getSeriesSheetId_v4(series.id);
  if (cell) {
    const bad = workbookValid_v4(cell, series, season);
    if (bad) throw new Error(`Series ${series.id} SpreadsheetID ${cell} is invalid: ${bad}`);
    return cell;
  }
  if (priorRounds > 0) throw new Error(`Series ${series.id} has ${priorRounds} processed round(s) in ${season} but no SpreadsheetID - fix the Series sheet`);
  const cfg = getConfig();
  if (!cfg.overallFolderId) throw new Error('Overall Folder Id is not configured.');
  const hasHandicap = hasHandicapSheet_v3(series);
  const file = SpreadsheetApp.create('Overall Results ' + series.name + ' ' + season), id = file.getId();
  try {
    file.getSheets()[0].setName('Overall Results');
    if (hasHandicap) file.insertSheet('Handicaps', file.getNumSheets());
    DriveApp.getFileById(id).moveTo(DriveApp.getFolderById(cfg.overallFolderId));
    overallSetup_v3(id, parsed, members, hasHandicap);
    saveSeriesSheetId_v4(series.id, id);               // last step: only on success
  } catch (e) { DriveApp.getFileById(id).setTrashed(true); throw e; }
  return id;
}