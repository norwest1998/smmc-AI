/* main.gs
 * Orchestrator: watches Drive folder, for each new sheet parse, score, write, and post.
 */

function processNewRegattaSheets() {
const cfg = getConfig();
const uploadFolderId = cfg.raceUploadFolderId;
if (!uploadFolderId) throw new Error('Upload folder id not configured.');
const folder = DriveApp.getFolderById(uploadFolderId);
const files = folder.getFiles();


const masterData = loadMasterData();
const fbPageId = cfg.fbPageId;
const fbToken = cfg.fbToken;


while (files.hasNext()) {
  const file = files.next();
  if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
  if ((file.getDescription()||'').indexOf('Processed by SMMC Admin AI') !== -1) continue;

  try {
    const sourceFileId = file.getId();          // ✅ THIS was missing
    const ss = SpreadsheetApp.openById(sourceFileId);
    
    let parsed = parseSimplifiedRegattaSheet(ss);
    if (!parsed) {
      Logger.log('Parse failed for ' + file.getName());
      file.setDescription((file.getDescription()||'') + ' | PARSE_FAILED');
      continue;
    }

    // Map sail numbers to members using ClassMembers for the parsed class
    parsed = mapSailNumbersToMembers(parsed, masterData);

    // Compute scores
    const scoresMap = buildScoresFromRaces(parsed, masterData);

    // Write overall results
    writeOverallResults(parsed, scoresMap, masterData);

    // Post to Facebook
    if (fbPageId && fbToken) postResultsAsImagePNG(parsed, scoresMap, masterData, fbPageId, fbToken);

      finalizeRaceResultsFile(
        sourceFileId,  // ← IMPORTANT: capture this earlier
        parsed
        );

      file.setDescription((file.getDescription()||'') + ' - Processed by SMMC Admin AI');

    } 
   catch (e) {
    Logger.log('Processing file ' + file.getName() + ' error: ' + e);
    file.setDescription((file.getDescription()||'') + ' | PROCESS_ERROR');
   }

  }
}

/**
 * Rename and move processed race results file
 */
function finalizeRaceResultsFile(sourceFileId, parsed) {

  if (!sourceFileId || typeof sourceFileId !== 'string') {
    throw new Error('finalizeRaceResultsFile: sourceFileId is invalid');
  }

  const file = DriveApp.getFileById(sourceFileId);

  const regattaName = parsed.regattaName || 'Regatta';
  const date = parsed.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const newName = `${regattaName} - ${date}`;

  // Rename file
  file.setName(newName);

  // ---- Move to Processed folder ----
  const cfg = getConfig();
  const processedFolderId = cfg.raceResultsProcessedFolderId;
  if (!processedFolderId) {
    throw new Error('raceResultsProcessedFolderId not set in config');
  }

  const processedFolder = DriveApp.getFolderById(processedFolderId);

  // Remove from parent folders
  const parents = file.getParents();
  while (parents.hasNext()) {
    parents.next().removeFile(file);
  }

  processedFolder.addFile(file);

  Logger.log(`Race results file finalised: ${newName}`);
}
