var FleetController = {
  onNewEdit(e) {
    const activeSheet = SpreadsheetApp.getActive().getSheetByName(Config.get().workingSheetName);
    const regattaname = activeSheet.getRange("B6").getValue();
    const classname = activeSheet.getRange("B7").getValue();

    /********************************************************************************************
    //Proces Event Data interrogation */

    const range = e.range;
    const sheet = range.getSheet();
    const editedCell = range.getA1Notation();

    // Case 1: User changed search date (B5) or regatta type (B6) → refresh dropdown
    if (editedCell === "B5" || editedCell === "B6") {
      activeSheet.getRange("A1").setValue(null);
      populateEventDropdown(sheet);  
    }   
    // Case 2: User selected a new event from dropdown (B4) → update A1 with Hex Key
    else if (editedCell === "B4") {
      handleDropdownSelection_(sheet);
    }
      
    /**********************************************************************************************
    //Process Class Members Map */
    if (!regattaname) {
      if(PROCESS_LOGGING) Logger.log("No regatta data to reference");
      return;
    }
    if (!classname) {
      if(PROCESS_LOGGING) Logger.log("No class data to reference");
      return;
    }

    // return if Fleet already populated and class = classname
    const spreadsheet = SpreadsheetApp.getActive();  // or getActiveSpreadsheet()
    const targetSheet = spreadsheet.getSheetByName(TARGET_SHEET_NAME);  // 'config'
    const targetClass = targetSheet.getRange(2, 5).getValue();
    if (targetClass === classname) {
      return;
    }

    // Get Valid Sail Numbers
    var TARGET_COLUMN_LETTER = 'E';
    var fields = 4;
    var listEndCol = 'H';
    processSheetData(TARGET_SHEET_NAME, TARGET_COLUMN_LETTER, "Fleet", fields, listEndCol, regattaname, classname);

  }
}



