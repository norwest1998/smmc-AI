/**
 * Finds or creates an Overall Results workbook with handicap support conditional on RaceSpecs.
 */
function getOrCreateOverall_v2(regattaName, parsed, members, racingFormat) {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.masterDataSpreadsheetId);
  const variablesSheet = ss.getSheetByName("Variables");
  if (!variablesSheet) throw new Error("The 'Variables' sheet could not be found.");
  const season = variablesSheet.getRange("E2").getValue();

  const overallResultsWorksheet = 'Overall Results ' + regattaName + " " + season;
  const propertyKey = `regattaWorkbookId_${overallResultsWorksheet}`;
  const seriesWorkbookId = getProp(propertyKey);

  if (seriesWorkbookId) {
    return seriesWorkbookId;
  }

  const overallFolderId = cfg.overallFolderId;
  if (!overallFolderId) {
    Logger.log('ERROR: Overall Folder Id is not configured.');
    return;
  }

  const overallFolder = DriveApp.getFolderById(overallFolderId);
  const newFile = SpreadsheetApp.create(overallResultsWorksheet);
  newFile.getSheets()[0].setName('Overall Results');

  // Verify if ANY child spec uses handicapping
  const hasHandicap = (racingFormat.raceSpecs || []).some(s => s.raceType === 'handicap');
  if (hasHandicap) {
    const lastPos = newFile.getNumSheets();
    newFile.insertSheet('Handicaps', lastPos);
  }

  const newId = newFile.getId();
  DriveApp.getFileById(newId).moveTo(overallFolder);
  setScriptProperty(propertyKey, newId);

  Logger.log(`Created new Overall Results Workbook v2: ${overallResultsWorksheet} (ID: ${newId})`);

  const nextRoundNumber = getNextRoundNumber(regattaName);
  if (nextRoundNumber !== 1) {
    resetRoundNumber(regattaName);
  }

  overallSetup_v2(newId, parsed, members, hasHandicap);
  return newId;
}

function overallSetup_v2(bookID, parsed, members, hasHandicap) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName('Overall Results');

  sh.getRange(OVERALL_META_ROW_1, 2, 1, 2).merge().setValue('Last Race:');
  sh.getRange(OVERALL_META_ROW_1, 4).setValue(0);
  sh.getRange(OVERALL_META_ROW_2, 2, 1, 2).merge().setValue('Rounds:');
  sh.getRange(OVERALL_META_ROW_2, 4).setValue(0);
  sh.getRange(OVERALL_META_ROW_1, 7).setValue('DNC').setHorizontalAlignment('right');

  const headers = [['Att', 'Sail #', 'Member Name', 'Rank', 'Total', 'Discard']];
  sh.getRange(OVERALL_HEADER_ROW, 2, 1, 6).setValues(headers);

  const memberData = members.map(m => ['', m.sailnumber, m.membername, '', '', '']);
  if (memberData.length > 0) {
    sh.getRange(OVERALL_DATA_START_ROW, 2, memberData.length, 6).setValues(memberData);
    const lastRow = OVERALL_DATA_START_ROW - 1 + memberData.length;
    if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  }

  if (hasHandicap) {
    const hs = ss.getSheetByName('Handicaps');
    if (hs) {
      hs.getRange(OVERALL_META_ROW_1, 2, 1, 2).merge().setValue('Last Race:');
      hs.getRange(OVERALL_META_ROW_1, 4).setValue(0);
      hs.getRange(OVERALL_META_ROW_2, 2, 1, 2).merge().setValue('Rounds:');
      hs.getRange(OVERALL_META_ROW_2, 4).setValue(0);

      const hsHeaders = [['Att', 'Sail #', 'Member Name', 'Starting Hcap', 'Adj', 'Current Hcap']];
      hs.getRange(OVERALL_HEADER_ROW, 2, 1, 6).setValues(hsHeaders);

      const memberHcapData = members.map(m => ['', m.sailnumber, m.membername, m.hcap || 0, '', '']);
      if (memberHcapData.length > 0) {
        hs.getRange(OVERALL_DATA_START_ROW, 2, memberHcapData.length, 6).setValues(memberHcapData);
        const hsLastRow = OVERALL_DATA_START_ROW - 1 + memberHcapData.length;
        if (hs.getMaxRows() > hsLastRow) hs.deleteRows(hsLastRow + 1, hs.getMaxRows() - hsLastRow);
      }
    }
  }
}