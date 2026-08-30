function mobileSubmitTrigger(e) {

  if (!e || !e.range) return;

  const COLOR_HEX = "#ffe599";
  const ss = e.source;
  const activeSheet = e.range.getSheet();
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = activeSheet.getName();
  const targetCell = sheet.getRange("E3");
  const cellAddress = range.getA1Notation();

  // Change "Sheet1" to your exact sheet name
  if (sheetName === "Race sheet") {

    var typeCell = sheet.getRange("E2").getValue();
    var classCell = sheet.getRange("C4").getValue();

    if (!typeCell || !classCell) {
      SpreadsheetApp.getUi().alert("Error", "Please enter a Class AND Race Type", SpreadsheetApp.getUi().ButtonSet.OK);
    }

    var triggerCell = sheet.getRange("E2");
    
    if (range.getA1Notation() === "E2") {
      if (e.value === "Scratch") {
        const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(["1 minute tape", "2 minute tape"], true) // true = show dropdown arrow
        .setAllowInvalid(false) // Blocks invalid entries
        .build();
        
        targetCell.setDataValidation(rule);
        targetCell.setBackground(COLOR_HEX);
        targetCell.setValue("1 minute tape");
        
      } else {
        targetCell.clearDataValidations();
        targetCell.clearContent();
        targetCell.setBackground("#f6b26b");
      }
    }

    
    // Only run if cell E2 was the one edited
    if (cellAddress === triggerCell.getA1Notation()) {
      var val = triggerCell.getValue();
      
      // List all columns involved across all conditions so they can be reset
      var allImpactedCols = [6,7,8,11,13,15,17,19,21,23,24,25,26,27,28,29,30,31,32]; 
      var allImpactedRows = [38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53]; 
      
      // Unhide all columns first to reset the view
      allImpactedCols.forEach(function(col) {
        sheet.showColumns(col);
      });

      // Unhide all rows first to reset the view
      allImpactedRows.forEach(function(row) {
        sheet.showRows(row);
      });
      
      // Define which columns to hide based on the value
      var colsToHide = [];
      var rowsToHide = [];
      if (val === "Scratch") {
        colsToHide = [6,7,8,11,13,15,17,19,21,23,25,27,29,31];
        rowsToHide = [38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53];
      } else if (val === "IOM Racing") {
        colsToHide = [11,24,25,26,27,28,29,30,31,32];
      }
      
      // Hide the specific columns for the active condition
      colsToHide.forEach(function(col) {
        sheet.hideColumns(col);
      });
      
      // Hide the specific rows for the active condition
      rowsToHide.forEach(function(row) {
        sheet.hideRows(row);
      });
    }
  }
  
  // 1. Monitor the Checkbox trigger on the "Race results sheet"
  if (sheetName === "Race results sheet") {
    const shResults = ss.getSheetByName("Round Results");
    if (!shResults) return;

    // Get total expected boats from Results sheet G2
    const totalBoats = Number(shResults.getRange("G2").getValue());
    if (!totalBoats || totalBoats <= 0) return;

    const editedRange = e.range;
    const editedColumn = editedRange.getColumn();
    const editedRow = editedRange.getRow();

    // 2. Count how many valid scores are currently entered in this specific column
    const sheetLastRow = activeSheet.getLastRow();
    if (sheetLastRow < 4) return;

    const columnValues = activeSheet.getRange(5, editedColumn, (sheetLastRow - 5 + 1), 1).getValues().flat();
    
    // Count non-empty values in the column
    const enteredScoresCount = columnValues.filter(val => val !== "" && val !== null).length;

    // 3. If the count matches the total boats, trigger the automated ranking calculation!
    if (enteredScoresCount === totalBoats) {
      // Optional: visual toast notification to show the user it is updating
      ss.toast("Note: Race fully captured!", 3);
      runAutomatedLeaderboard(ss, shResults, totalBoats);
    }

    if (cellAddress === "N1") {
          if (e.value === "TRUE") {     
        // 2. Identify the target sheets
        const raceResultsSheet = sheet;
        const raceSheets = ss.getSheetByName("Race sheet");
        
        if (!raceSheets) {
          ss.toast("Error: 'Race sheets' tab not found.", "Failed", 5);
          range.setValue(false);
          return;
        }
        
        // 3. Extract variables for file name from 'Race sheets'
        const rawClass = raceSheets.getRange("C4").getValue();
        const rawType = raceSheets.getRange("E2").getValue();
        const rawDate = raceSheets.getRange("C2").getValue();
        
        // Clean up empty fields to prevent broken file names
        if (!rawClass || !rawType || !rawDate) {
          ss.toast("Error: Class, Type, or Date is missing!", "Failed", 5);
          range.setValue(false);
          return;
        }
        
        // Clean format for the date string (e.g., 2026-07-10)
        const formattedDate = Utilities.formatDate(new Date(rawDate), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        const newFileName = rawClass + " " + rawType + " " + formattedDate;
        
        // 4. Extract data from 'Race results sheet'!B3:N36
        const resultsRange = raceResultsSheet.getRange("C5:N37");
        const resultsValues = resultsRange.getValues();
        
        // 5. Build the new external Spreadsheet file
        const newSpreadsheet = SpreadsheetApp.create(newFileName);
        const targetSheet = newSpreadsheet.getSheets()[0];
        targetSheet.setName("Race Results");
        
        // Paste data values only
        const targetRange = targetSheet.getRange(1, 1, resultsValues.length, resultsValues[0].length);
        targetRange.setValues(resultsValues);
        
        // NEW: Move the file to the "Scoresheets" folder
        try {
          const folders = DriveApp.getFoldersByName("Pending Race Results");
          if (folders.hasNext()) {
            const targetFolder = folders.next();
            const file = DriveApp.getFileById(newSpreadsheet.getId());
            
            // Add file to target folder and remove from root
            targetFolder.addFile(file);
            DriveApp.getRootFolder().removeFile(file);
          } else {
            // If folder doesn't exist, log it but keep going
            ss.toast("Note: 'Scoresheets' folder not found. Saved to main Drive instead.", "Warning", 6);
          }
        } catch (folderError) {
          ss.toast("Saved to main Drive (could not move to folder).", "Warning", 4);
        }
        
        // Housekeeping: Wipe inputs and prepare template for the next race
        resultsRange.clearContent();             // Empties 'Race results sheet'!B3:N36
        raceSheets.getRange("E2").clearContent(); 
        raceSheets.getRange("C4").clearContent(); 
        raceSheets.getRange("B7:B37").clearContent();
        range.setValue(false);                   // Resets the Save cell checkbox back to unchecked
        
        // Send a visual mobile confirmation banner
        ss.toast("File saved to Scoresheets as: " + newFileName, "Success", 4);
      }
    }
  }
}