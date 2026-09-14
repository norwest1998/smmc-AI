/**
 * Searches a Google Drive folder for the first available JSON file.
 * 
 * @param {string} folderId - Google Drive Folder ID where JSON files land.
 * @return {DriveApp.File|null} The File object if found, or null if no file is present.
 */
function getJsonFileFromFolder(folderId = CONFIG.raceUploadFolderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    
    // Get all files in the folder
    const files = folder.getFiles();

    while (files.hasNext()) {
      const file = files.next();
      const fileName = file.getName().toLowerCase();

      if ((file.getDescription() || '').includes('Processed by SMMC Admin AI')) continue;
      Logger.log('Found JSON file: ' + file.getName() + ' (ID: ' + file.getId() + ')');
      return file;
    }

    Logger.log('No JSON files found in folder.');
    return null;

  } catch (error) {
    Logger.log('Error accessing folder or files: ' + error.toString());
    return null;
  } 
}

function archiveProcessedFile(file, archiveFolderId) {
  try {
    const archiveFolder = DriveApp.getFolderById(archiveFolderId);
    file.moveTo(archiveFolder);
    Logger.log(`Moved ${file.getName()} to archive.`);
    file.setName('PROCESSED_' + file.getName());
    const newDescription = `Processed by SMMC Admin AI ` + formatDate(new Date());
    file.setDescription(newDescription);
    Logger.log(`File description updated for processing flag: ${file.getName()}`);
  } catch (e) {
    Logger.log('Error archiving file: ' + e.toString());
  }
}

/**
* Parse a Race Results sheet and return structured object
*/
function parseSimplifiedRegattaSheet(fileId) {
  const ss = SpreadsheetApp.openById(fileId);
  const sheet = ss.getSheets()[0];

  const cellValue = sheet.getRange("A1").getValue();
  const data = JSON.parse(cellValue);

  if (!data.eventID) {
    console.log("not json data");
  }

  let raceReport = data.raceReport;
  if (!raceReport) {
    const raceReportDate = formatDate(data.regattaDate);
    raceReport = `Race results for ${data.regattaName} sailed on the ${raceReportDate}`;
  }

  return {
    eventID: data.eventID,
    regattaName: data.regattaName,
    className: data.className,
    date: data.regattaDate,
    competitorCount: data.competitorCount,
    raceReport,
    races: data.races
  };
}