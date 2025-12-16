/**
* Orchestrator: scan upload folder for new files, parse, score, write and post
*/
function processNewRegattaSheets() {
  // get config data
  const cfg = getConfig();
  const fbPageId = cfg.fbPageId;
  const fbToken = cfg.fbToken;
  const uploadFolderId = cfg.raceUploadFolderId;
  if (!uploadFolderId) throw new Error('Upload folder id not configured.');
  
  const folder = DriveApp.getFolderById(uploadFolderId);
  const files = folder.getFiles();

  const md = getMasterData();

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
    if ((file.getDescription()||'').indexOf('Processed by SMMC Admin AI') !== -1) continue;

    //try {
      const sourceFileId = file.getId();                 // ✅ THIS was missing
      const ss = SpreadsheetApp.openById(sourceFileId);
    
      // 1. Parse the new sheet/file (returns raw data with sail numbers)
      const parsed = parseSimplifiedRegattaSheet(ss); 
      let currentClassData = md.classMembersMap[parsed.className];

      // 2. Build scores
      const scoresMap = buildScoresFromRaces(parsed, currentClassData);
      let rankedScoresMap = rankScoresMap(scoresMap);

      // 3. Get or Create the Overall Results Sheet, scoping by Regatta Name
      const overallSheetID = getOrCreateOverall(parsed.regattaName, parsed, currentClassData); 

      // 4. Create the round sheet
      roundWrite(overallSheetID, rankedScoresMap, parsed);

      // 5. Add round to the Overall sheet (and trigger series recalc)
      appendRound(overallSheetID, parsed, rankedScoresMap);;

      // 6. Post the results image to Facebook
      // postResultsAsImagePNG(parsed, rankedScoresMap, overallSheetID, fbPageId, fbToken);

      // 7. Mark the file as processed
      // finalizeRaceResultsFile(file, parsed);

    //} 
    //  catch (e) {
    //  Logger.log(`ERROR processing file ${file.getName()}: ${e.message}`);
    //}
  };
}


/**
 * Rename and move processed race results file
 */
function finalizeRaceResultsFile(file, parsed) {
  const cfg = getConfig();
  const archiveFolderId = cfg.resultsProcessedFolderId;
  if (!archiveFolderId) {
    Logger.log('ERROR: raceResultsProcessedFolderId is not configured. File move skipped.');
    return; // Stop if the configuration is missing
  }
  const archiveFolder = DriveApp.getFolderById(archiveFolderId); 
  // -------------------------------------------------------------------
  
  const regatta = parsed.regattaName;
  let dateStr = tryNormalizeDate(parsed.date);

  // 1. Update the file description to prevent re-processing
  const newDescription = `PROCESSED: ${regatta} results for ${dateStr}.`;
  try {
    file.setDescription(newDescription);
    Logger.log(`File description updated for processing flag: ${file.getName()}`);
  } catch (e) {
    Logger.log(`WARNING: Failed to update file description for ${file.getName()}. Error: ${e.message}`);
  }
  
  // 2. Rename and Archive
  try {
    // Move the file to the archive folder
    const newFile = file.moveTo(archiveFolder);
    
    Logger.log(`File archived successfully: ${newFile.getName()} moved to ${archiveFolder.getName()}`);
  } catch (e) {
    Logger.log(`ERROR: FAILED to archive file ${file.getName()}. It is marked PROCESSED but remains in the input folder. Error: ${e.message}`);
    // The file is marked PROCESSED, so the orchestrator can ignore it next time.
  }
}
