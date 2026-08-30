function loadRegattasToConfig(){

  const TARGET_SHEET_NAME = CONFIG_SHEET_NAME;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    Logger.log("No avtivesheet");
    return;
  }

//  const sheet = ss.getActiveSheet();

  // Regatta names - with Class
  var TARGET_COLUMN_LETTER = 'A';
  var fields = 3;
  var listEndCol = 'C';
  processSheetData(TARGET_SHEET_NAME, TARGET_COLUMN_LETTER, "Regatta", fields, listEndCol);
}

function refreshConfigFromClubManagement() {
  /******************************* 
  // "Club Managment" sheet
  ********************************/

  const TARGET_SHEET_NAME = CONFIG_SHEET_NAME;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    Logger.log("No activesheet");
    return;
  }

  const sheet = ss.getActiveSheet();
  const regattaName = sheet.getRange("B6").getValue();
  const classname = sheet.getRange("B7").getValue();

  // Regatta names - with Class
  var TARGET_COLUMN_LETTER = 'A';
  var fields = 3;
  var listEndCol = 'C';
  processSheetData(TARGET_SHEET_NAME, TARGET_COLUMN_LETTER, "Regatta", fields, listEndCol, regattaName, classname);

  if(!classname) {
    return;
  }
Logger.log ("Class: " + classname);

  // Get Valid Sail Numbers

  TARGET_COLUMN_LETTER = 'E';
  fields = 4;
  listEndCol = 'H';
  Logger.log("Trg Sheet: " + TARGET_SHEET_NAME + " Trg Column: " + TARGET_COLUMN_LETTER + " Fleet " + " FIelds: " +  fields + 
  " End Col: " +  listEndCol + " Reg Name: " + regattaName + " Class Name: " + classname);
  processSheetData(TARGET_SHEET_NAME, TARGET_COLUMN_LETTER, "Fleet", fields, listEndCol, regattaName, classname);

}

function processSheetData(targetSheetName, targetColumn, list, columns, endCol, regattaName, classname) {
  
  const data = getMasterData();



  let validationData = [];
  let headers = [];
 
  // --- 1. Extract and Format Data ---
  if (list === "Regatta") {
    validationData = data.regattas.map(r => [
      r.regattaId,      // Column 1 (A)
      r.regattaname,    // Column 2 (B) - This will be the validation source
      r.classname       // Column 3 (C) - This will be the lookup value
    ]);
    Logger.log("Validation data " + validationData);
    headers = ['RegattaID', 'Regatta Name', 'Class'];   
    writeDataToConfig(validationData, targetSheetName, targetColumn, headers, columns, endCol) ;
    return;
  }
  if (list === "Fleet") {
  // Check if the class exists in the map first
    if (!data.classMembersMap || !data.classMembersMap[classname]) {
      Logger.log("Error: Class '" + classname + "' not found in classMembersMap.");
      SpreadsheetApp.getActive().toast(`❌ Class "${classname}" not found in data.`, "Error", 5);
      return; // Exit early to prevent crash
    }

    validationData = data.classMembersMap[classname].map(r => [
      classname,
      r.membername,
      r.sailnumber,
      r.boatId
    ]);

    headers = ['Class Name', 'Member Name', 'Sail Number', 'Boat ID'];
    writeDataToConfig(validationData, targetSheetName, targetColumn, headers, columns, endCol) ;

    // Get Leaderboard Information
    if (!regattaName) return;
    var leaderboard = getLeaderboard(regattaName);
    if(leaderboard.roundNum) SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getRange("C8").setValue(leaderboard.roundNum);


    TARGET_COLUMN_LETTER = "J";
    fields = 4;
    listEndCol = 'M';
    headers = ['Sail Number',	'Member Name',	'Rank',	'Points'];
    writeDataToConfig(leaderboard.data, TARGET_SHEET_NAME, TARGET_COLUMN_LETTER, headers, fields, listEndCol);

  }
  SpreadsheetApp.getActive().toast(
     `✅ helper data loaded. \n
     Sail Numbers can now be validated`,
      "Done", 5 );
}

function writeDataToConfig(data, targetSheetName, targetColumn, headers, columns, endCol)   {
  if (data.length === 0) {
    Logger.log('No regatta data to write for validation list.');
    return;
  }
  const endrow = data.length +1;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(targetSheetName);

  Logger.log("Sheet: " + targetSheetName);

  // --- 2. Clear Existing Data and Write Headers ---
  // Clear columns A, B, and C
  const clearRange = targetSheet.getRange(`${targetColumn}:${endCol}`); 
  clearRange.clearContent();
  
  // Set the headers in A1, B1, C1
  targetSheet.getRange(`${targetColumn}1:${endCol}1`).setValues([headers]);
  
  // --- 3. Write New Data ---
  // Determine the target range: starts at A2, is N rows long, and 3 columns wide.
  const targetRange = targetSheet.getRange(
    2,                                      // start row
    columnLetterToNumber(targetColumn),     // start column
    data.length,
    columns
  );
  
  targetRange.setValues(data);
  Logger.log(`Wrote ${data.length} records ( ${columns} fields each) to ${targetSheet}!${targetColumn}2:${endCol}${endrow}.`);
}

function columnLetterToNumber(letter) {
  return letter.charCodeAt(0) - 64;
}