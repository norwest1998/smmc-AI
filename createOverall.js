/**
 * Finds or creates an Overall Results sheet for a regatta type
 */
function getOrCreateOverall(regattaName, parsed, members) {
  
  // Differnt Regattas have different Overall Results sheets 
  const propertyKey = `regattaWorkbookId_${regattaName}`;
  const seriesWorkbookId = getProp(propertyKey)
  
  if (seriesWorkbookId) {
    return seriesWorkbookId;
  }
  
  // Regatta overall results sheet not found, need to create an add to script properties 
  const newName = `Overall Results ${regattaName}`;

  const cfg = getConfig();
  const overallFolderId = cfg.overallFolderId;
  if (!overallFolderId) {
    Logger.log('ERROR: Overall Folder Id is not configured. File move skipped.');
    return; // Stop if the configuration is missing
  }
  const overallFolder = DriveApp.getFolderById(overallFolderId); 
  const newFile = SpreadsheetApp.create(newName); 
  newFile.getSheets()[0].setName("Overall Results")
  
  const newId = newFile.getId();
  const movefile = DriveApp.getFileById(newId);
  movefile.moveTo(overallFolder);

  // Save the new ID 
  setScriptProperty(propertyKey, newId); 
  
  Logger.log(`Created new Overall Results Workbook: ${newName} (ID: ${newId}) in folder Overall Results Sheets`);

  // Populate the Headings and members
  overallSetup(newId, parsed, members);
  return newId;
}

function overallSetup(bookID, parsed, members) {
  const ss = SpreadsheetApp.openById(bookID);
  
  // Create Overall Results
  let sh = ss.getSheetByName("Overall Results") || ss.insertSheet("Overall Results", 0);

  // Setup Metadata Labels
  sh.getRange("B2:C2").merge().setValue("Last Race : " + parsed.date);
  sh.getRange("B3:C3").merge().setValue("Rounds : 0");
  sh.getRange("F2").setValue("DNC").setHorizontalAlignment("right");

  // Headers
  const headers = [["Attended", "Sail #", "Member Name", "Rank", "Total", "Discard"]];
  sh.getRange("A4:F4").setValues(headers);

  // Populate Members
  const memberData = members.map(m => ["", m.sailnumber, m.membername, "", "", ""]);
  if (memberData.length > 0) {
    sh.getRange(5, 1, memberData.length, 6).setValues(memberData);
    const lastRow = 4 + memberData.length;
    if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  }

  applyOverallFormatting(sh, memberData.length);
}