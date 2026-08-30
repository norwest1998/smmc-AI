function handleProcessingRequest(params) {
  try {
    const sheetId = params.sheetId;
    const rowIndex = params.rowIndex;

    console.log("In handle Process Request: " + rowIndex);
    
    // Open the spreadsheet/sheet using the ID passed in the payload
    const ss = SpreadsheetApp.openById(sheetId);
    // NOTE: Use the sheet name defined in your CONFIG if possible, otherwise use a hardcoded name
    const sheet = ss.getSheetByName(CONFIG.membershipSheetName); 
    
    if (!sheet) {
        console.log("Error: Sheet not found in Project B execution.");
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Sheet not found' }));
    }

    // --- CALL THE NECESSARY PROCESSING LOGIC HERE ---
    console.log("Update Nomination Sheet");
    const status = updateNominationStatus(sheet, rowIndex);

    // 1. Check for final approval if the comments edit might finalize a row
    if (status === 'Awaiting Approval') {
        console.log('check For Final Approval');
        checkForFinalApproval(sheet, rowIndex); 
    }

    console.log(`Successfully triggered processing for row ${rowIndex} on sheet ${sheetId}.`);
    return ContentService.createTextOutput(JSON.stringify({ status: `Successfully triggered processing for row ${rowIndex} on sheet ${sheetId}.` }));
    
  } catch (error) {
    console.log("Error in Project B's processing handler: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }));
  }
}

