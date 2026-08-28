/**
 * Finds or creates an Overall Results sheet for a regatta type
 */
function getOrCreateOverall(regattaName, parsed, members, raceType) {
  
  // 1. Fetch the season from the "Variables" sheet, cell E2
  const ss = SpreadsheetApp.openById(AUTOMATION_SHEET_ID);
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

  const cfg = getConfig();
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
      console.log('Round for ${regattaName} reset to 1');
    }
    else {
      console.log('Error resetting round for ${regattaName}');
     }
  }

  // Populate the Headings and members
  overallSetup(newId, parsed, members, raceType);
  return newId;
}

function overallSetup(bookID, parsed, members, raceType) {
  const ss = SpreadsheetApp.openById(bookID);
  
  // Create Overall Results
  let sh = ss.getSheetByName('Overall Results');

  // Setup Metadata Labels
  sh.getRange("B2:C2").merge().setValue('Last Race:');
  sh.getRange("D2").setValue(0);
  sh.getRange("B3:C3").merge().setValue('Rounds:');
  sh.getRange("D3").setValue(0);
  sh.getRange("G2").setValue('DNC').setHorizontalAlignment('right');

  // Headers
  var headers = [['Att', 'Sail #', 'Member Name', 'Rank', 'Total', 'Discard']];
  sh.getRange("B5:G5").setValues(headers);

  // Populate Members
  const memberData = members.map(m => ['', m.sailnumber, m.membername, '', '', '']);
  if (memberData.length > 0) {
    sh.getRange(6, 2, memberData.length, 6).setValues(memberData);
    const lastRow = 5 + memberData.length;
    if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  }
  let rules = sh.getConditionalFormatRules();
  const range = sh.getRange(6,2, memberData.length,6);
  const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground('#FFF9C4') // light yellow
    .setRanges([range])
    .build();

  rules.push(evenRowRule);
  sh.setConditionalFormatRules(rules);

  if (raceType === 'Handicap') {
    // create Handicap sheet
    let hs = ss.getSheetByName('Handicaps');    
    let hsRules = hs.getConditionalFormatRules();
    const hsRange = hs.getRange(6,2, memberData.length,6);
    const hsEvenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground('#FFF9C4') // light yellow
    .setRanges([hsRange])
    .build();

    // Setup Metadata Labels
    hs.getRange("B2:C2").merge().setValue('Last Race:');
    hs.getRange("D2").setValue(0);
    hs.getRange("B3:C3").merge().setValue('Rounds:');
    hs.getRange("D3").setValue(0);

    // Headers
    headers = [['Att', 'Sail #', 'Member Name', 'Starting Hcap','Adj','Current Hcap']];
    hs.getRange("B5:G5").setValues(headers);

    // Populate Members
    const memberHcapData = members.map(m => ['', m.sailnumber, m.membername, m.hcap, '', '']);
    if (memberData.length > 0) {
      hs.getRange(6, 2, memberHcapData.length, 6).setValues(memberHcapData);
      const lastRow = 5 + memberHcapData.length;
      if (hs.getMaxRows() > lastRow) hs.deleteRows(lastRow + 1, hs.getMaxRows() - lastRow);
    } 
    hsRules.push(hsEvenRowRule);
    hs.setConditionalFormatRules(hsRules);
  }
  console.log('File setup for ' + memberData.length + ' competitors');
}