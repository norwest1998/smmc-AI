function findSheetInFolder(folderName, sheetName) {
  
  const folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) {
    Logger.log("Folder not found: " + folderName);
    return;
  }
  
  const folder = folders.next();
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  
  while (files.hasNext()) {
    const file = files.next();
    var fileName = file.getName();
    if(fileName === sheetName) {
      const sheetID = file.getId();
      return sheetID;
    }
  }
}


function sheetToObjects(ss, sheetName, keys) {
  try {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    
    const results = [];
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const obj = {};
      
      for (let i = 0; i < keys.length; i++) {
        // Ensure we don't read past the actual data returned in this row
        const cellValue = (i < row.length) ? row[i] : null;
        
        // Handle empty strings safely
        obj[keys[i]] = (cellValue === '' || cellValue === undefined) ? '' : cellValue;
      }
      
      // Temporary debug log to see exactly what is being parsed per row
      Logger.log(`Row ${r} parsed: ` + JSON.stringify(obj));
      
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error: ' + e);
    return [];
  }
}

function getHourlyWeatherSheet_(sheetId, raceDate) {
  const ss = SpreadsheetApp.openById(sheetId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const raceDay = new Date(raceDate);
  raceDay.setHours(0, 0, 0, 0);

  const dayDiff = Math.floor((today - raceDay) / 86400000);

  if (dayDiff < 1) {
    return ss.getSheetByName("WZ Hourly Data"); // forecast
  }
  if (dayDiff === 1) {
    return ss.getSheetByName("WZ Actual Hourly Data");
  }
  return ss.getSheetByName("WZ Actual Hourly Archive");
}

function buildRaceDateTime(dateStr, timeStr) {
  // dateStr: dd/MM/yyyy
  // timeStr: HH:mm
  const [d, m, y] = dateStr.split('/').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}