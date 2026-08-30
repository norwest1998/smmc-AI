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

  // is json?
  const cellValue = sheet.getRange("A1").getValue();
  const data = JSON.parse(cellValue);

  if (!(data.eventID)){
    Logger.log("not json data");
  }

  const eventID = data.eventID;
  const regattaName = data.regattaName;
  const className = data.className;
  const date = data.regattaDate;
  const competitorCount = data.competitorCount;
  var raceReport = data.raceReport;
  if(!raceReport) {
    var raceReportDate = formatDate(data.regattaDate);
    raceReport = `Race results for ${regattaName} sailed on the ${raceReportDate}`;
  }
  
  const raceData = data.races;
  const races = {};

  // 1. Map every race result to the specific boat
  raceData.forEach((race, raceIdx) => {
    const raceNum = race.raceNumber;

    // Process Finishers (Results are top-down, so index + 1 = position)
    race.positions.forEach((sailNum, index) => {
      initSail(races, sailNum, raceData.length);
      races[sailNum][`race_${raceNum}`] = index + 1; 
    });

    // Process DNS (Did Not Start)
    if (race.dns) {
      const dnsSails = Array.isArray(race.dns) ? race.dns : [race.dns];
      dnsSails.forEach(sailNum => {
        initSail(races, sailNum, raceData.length);
        races[sailNum][`race_${raceNum}`] = "DNS";
      });
    }

    // Process DNF (Did Not Finish)
    if (race.dnf) {
      const dnfSails = Array.isArray(race.dnf) ? race.dnf : [race.dnf];
      dnfSails.forEach(sailNum => {
        initSail(races, sailNum, raceData.length);
        races[sailNum][`race_${raceNum}`] = "DNF";
      });
    }
  });

  return {
    eventID,
    regattaName,
    className,
    date,
    competitorCount,
    raceReport,
    races: raceData
  };

}

// Helper to ensure the boat exists
function initSail(obj, sailNum, totalRaces) {
  if (!obj[sailNum]) {
    obj[sailNum] = { sailNumber: sailNum };
    // Initialize all races as null/empty
    for (let i = 1; i <= totalRaces; i++) {
      obj[sailNum][`race_${i}`] = "-";
    }
  }
}