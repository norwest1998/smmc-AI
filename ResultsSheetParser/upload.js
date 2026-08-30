var UploadController = {
  archiveAndReset() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getActiveSheet();

    const regattaName = sourceSheet.getRange("B6").getDisplayValue();
    const regattaDate = sourceSheet.getRange("B5").getDisplayValue();
    
    // Define the headers/metadata
    const meta = {
      eventID: sourceSheet.getRange("A1").getValue(),
      regattaDate: regattaDate, // getDisplayValue preserves date format
      startTime: sourceSheet.getRange("C5").getDisplayValue(),
      endTime: sourceSheet.getRange("D5").getDisplayValue(),
      regattaName: regattaName,
      className: sourceSheet.getRange("B7").getValue(),
      competitorCount: sourceSheet.getRange("B8").getValue(),
      raceReport: sourceSheet.getRange("E5").getValue(),
    };

    const races = [];
    
    // Columns B (2) through Q (17)
    for (let col = 2; col <= 17; col++) {
      // Check if there is a value in the positions range to see if race exists
      let columnValues = sourceSheet.getRange(10, col, 20, 1).getValues().flat();
      
      // Clean data: remove empty cells from the bottom of the column
      let results = columnValues.filter(val => val !== "");
      
      // Only process if the column isn't empty
      if (results.length > 0 || sourceSheet.getRange(32, col).getValue() !== "") {
        let raceData = {
          raceNumber: col - 1, // Race 1, Race 2, etc.
          raceRO: sourceSheet.getRange(32, col).getValue(),
          positions: results,
          dnf: sourceSheet.getRange(34, col,4,1).getValues().flat(),
          dns: sourceSheet.getRange(39, col,4,1).getValues().flat()
        };
        races.push(raceData);
      }
    }

    const finalJson = {
      ...meta,
      races: races
    };

    // 3. Create the New Spreadsheet in the specific folder
    const cfg = Config.get();
    if (!cfg.raceResultsUploadFolderId) {
      throw new Error('Upload folder ID not configured.');
    }
    const folderId = cfg.raceResultsUploadFolderId;
    const folder = DriveApp.getFolderById(folderId);

    const fileName = regattaName + " - " + regattaDate;

    const newSS = SpreadsheetApp.create(fileName);
    const file = DriveApp.getFileById(newSS.getId());
    
    // 4. Write the JSON into the new spreadsheet
    const outputSheet = newSS.getSheets()[0];
    outputSheet.setName("JSON Export");
    outputSheet.getRange(1, 1).setValue(JSON.stringify(finalJson, null, 2));
    
    // Move file to the correct folder
    file.moveTo(folder);
    
    resetSheet(sourceSheet);
    resetConfig();
    SpreadsheetApp.getUi().alert("Successfully exported " + races.length + " races.");
  }
};

function resetSheet(sheet){
    // Empty races
    sheet.getRange(`B10:Q61`).clearContent(); 
    // Clear HexKey
    sheet.getRange(`A1`).clearContent();
    // Clear Round
    sheet.getRange(`C7`).clearContent();
    // Clear race info
    sheet.getRange(`B4:B6`).clearContent();
    // Clear time
    sheet.getRange(`C5:D5`).clearContent(); 
    // Clear Race Report
    sheet.getRange(`E5`).clearContent(); 
}

function resetConfig(){
  ss = SpreadsheetApp.getActiveSpreadsheet();
  sh = ss.getSheetByName('Config');
  
  // Empty Config
  sh.getRange(`D:M`).clearContent(); 
  
  const cfg = Config.get();
  const folderId = cfg.raceResultsUploadFolderId;
  
  const processedFolder = DriveApp.getFolderById(folderId);
  const imageFile = sh.getRange("D1").getValue();
  if(!imageFile) {
    console.log('No image file to move.');
  } else{
    const file = DriveApp.getFileById(imageFile);
    file.moveTo(processedFolder);
  }

}
