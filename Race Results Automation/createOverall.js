/**
 * Finds or creates an Overall Results sheet for a regatta type
 */
function getOrCreateOverall(regattaName, parsed, members, raceType) {
  const cfg = getConfig();
  // 1. Fetch the season from the "Variables" sheet, cell E2
  const ss = SpreadsheetApp.openById(cfg.masterDataSpreadsheetId);
  const variablesSheet = ss.getSheetByName("Variables");
    // Check if the Variables sheet actually exists first
  if (!variablesSheet) {
    throw new Error("The 'Variables' sheet could not be found.");
  }
  const season = variablesSheet.getRange("E2").getValue();

  // 2. Different Regattas have different Overall Results sheets, including season
  const overallResultsWorksheet = 'Overall Results ' + regattaName + " " + season;
  const propertyKey = `regattaWorkbookId_${overallResultsWorksheet}`;
  const seriesWorkbookId = getProp(propertyKey);

  if (seriesWorkbookId) {
    return seriesWorkbookId;
  }

  const overallFolderId = cfg.overallFolderId;
  if (!overallFolderId) {
    Logger.log('ERROR: Overall Folder Id is not configured. File move skipped.');
    return; // Stop if the configuration is missing
  }
  const overallFolder = DriveApp.getFolderById(overallFolderId); 
  const newFile = SpreadsheetApp.create(overallResultsWorksheet); 
  newFile.getSheets()[0].setName('Overall Results')
  
  if (raceType === 'Handicap') {
    const lastPosition = newFile.getNumSheets();
    newFile.insertSheet('Handicaps', lastPosition);
  }
  const newId = newFile.getId();
  const movefile = DriveApp.getFileById(newId);
  movefile.moveTo(overallFolder);

  // Save the new ID 
  setScriptProperty(propertyKey, newId); 

  Logger.log(`Created new Overall Results Workbook: ${overallResultsWorksheet} (ID: ${newId}) in folder Overall Results Sheets`);

  //Reset Round Number if regatta rounds exist
  var nextRoundNumber = getNextRoundNumber(regattaName);
  if (nextRoundNumber !== 1) {
    var roundReset = resetRoundNumber(regattaName)
    if (roundReset) {
      console.log(`Round for ${regattaName} reset to 1`);
    }
    else {
      console.log(`Error resetting round for ${regattaName}`);
     }
  }

  // Populate the Headings and members
  overallSetup(newId, parsed, members, raceType);
  return newId;
}

function overallSetup(bookID, parsed, members, raceType) {
  const ss = SpreadsheetApp.openById(bookID);
  let sh = ss.getSheetByName('Overall Results');

  // Metadata (rows 3-4; rows 1-2 and 5-6 are spacers)
  sh.getRange(OVERALL_META_ROW_1, 2, 1, 2).merge().setValue('Last Race:');
  sh.getRange(OVERALL_META_ROW_1, 4).setValue(0);
  sh.getRange(OVERALL_META_ROW_2, 2, 1, 2).merge().setValue('Rounds:');
  sh.getRange(OVERALL_META_ROW_2, 4).setValue(0);
  sh.getRange(OVERALL_META_ROW_1, 7).setValue('DNC').setHorizontalAlignment('right');

  // Headers (row 7)
  var headers = [['Att', 'Sail #', 'Member Name', 'Rank', 'Total', 'Discard']];
  sh.getRange(OVERALL_HEADER_ROW, 2, 1, 6).setValues(headers);

  // Members (row 8+)
  const memberData = members.map(m => ['', m.sailnumber, m.membername, '', '', '']);
  if (memberData.length > 0) {
    sh.getRange(OVERALL_DATA_START_ROW, 2, memberData.length, 6).setValues(memberData);
    const lastRow = OVERALL_DATA_START_ROW - 1 + memberData.length;
    if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  }

  let rules = sh.getConditionalFormatRules();
  const range = sh.getRange(OVERALL_DATA_START_ROW, 2, memberData.length, 6);
  const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground('#FFF9C4')
    .setRanges([range])
    .build();
  rules.push(evenRowRule);
  sh.setConditionalFormatRules(rules);

  if (raceType === 'Handicap') {
    let hs = ss.getSheetByName('Handicaps');
    let hsRules = hs.getConditionalFormatRules();
    const hsRange = hs.getRange(OVERALL_DATA_START_ROW, 2, memberData.length, 6);
    const hsEvenRowRule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=ISEVEN(ROW())')
      .setBackground('#FFF9C4')
      .setRanges([hsRange])
      .build();

    hs.getRange(OVERALL_META_ROW_1, 2, 1, 2).merge().setValue('Last Race:');
    hs.getRange(OVERALL_META_ROW_1, 4).setValue(0);
    hs.getRange(OVERALL_META_ROW_2, 2, 1, 2).merge().setValue('Rounds:');
    hs.getRange(OVERALL_META_ROW_2, 4).setValue(0);

    headers = [['Att', 'Sail #', 'Member Name', 'Starting Hcap', 'Adj', 'Current Hcap']];
    hs.getRange(OVERALL_HEADER_ROW, 2, 1, 6).setValues(headers);

    const memberHcapData = members.map(m => ['', m.sailnumber, m.membername, m.hcap, '', '']);
    if (memberHcapData.length > 0) {
      hs.getRange(OVERALL_DATA_START_ROW, 2, memberHcapData.length, 6).setValues(memberHcapData);
      const lastRow = OVERALL_DATA_START_ROW - 1 + memberHcapData.length;
      if (hs.getMaxRows() > lastRow) hs.deleteRows(lastRow + 1, hs.getMaxRows() - lastRow);
    }
    hsRules.push(hsEvenRowRule);
    hs.setConditionalFormatRules(hsRules);
  }
  console.log('File setup for ' + memberData.length + ' competitors');
}