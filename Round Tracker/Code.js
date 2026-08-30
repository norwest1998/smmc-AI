// Round Tracker Web App for Google Sheets
// Deploy as Web App: Deploy > New deployment > Web app

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    
    switch(action) {
      case 'getNextRound':
        return getNextRoundNumber(params);
      case 'storeRoundInfo':
        return storeRoundInformation(params);
      case 'checkRoundExists':
        return checkRoundExists(params);
      case 'incrementRound':
        return incrementRoundNumber(params);
      case 'getRoundData': 
        return getRoundData(params);
      case 'resetRound': 
        return resetRoundNumber(params);
      default:
        return createResponse(false, 'Invalid action');
    }
  } catch(error) {
    return createResponse(false, error.toString());
  }
}

function doGet(e) {
  const action = e.parameter.action;
  const regattaName = e.parameter.regattaName;
  
  try {
    if (action === 'getNextRound' && regattaName) {
      return getNextRoundNumber({ regattaName: regattaName });
    }
    if (action === 'getRoundData' && eventID) {
      return getRoundData({ eventID: eventID });
    }
    return createResponse(false, 'Invalid GET request');
  } catch(error) {
    return createResponse(false, error.toString());
  }
}

// Get next round number for a regatta
function getNextRoundNumber(params) {
  const regattaName = params.regattaName;
  
  if (!regattaName) {
    return createResponse(false, 'regattaName is required');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, 'Next Round', ['regattaName', 'roundNumber']);
  const data = sheet.getDataRange().getValues();
  
  // Find the regatta
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === regattaName) {
      return createResponse(true, 'Round number retrieved', {
        regattaName: regattaName,
        roundNumber: data[i][1]
      });
    }
  }
  
  // If not found, create new entry with round 1
  sheet.appendRow([regattaName, 1]);
  return createResponse(true, 'New regatta created with round 1', {
    regattaName: regattaName,
    roundNumber: 1
  });
}

// Increment round number for a regatta
function incrementRoundNumber(params) {
  const regattaName = params.regattaName;
  
  if (!regattaName) {
    return createResponse(false, 'regattaName is required');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, 'Next Round', ['regattaName', 'roundNumber']);
  const data = sheet.getDataRange().getValues();
  
  // Find and increment
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === regattaName) {
      const newRound = data[i][1] + 1;
      sheet.getRange(i + 1, 2).setValue(newRound);
      return createResponse(true, 'Round number incremented', {
        regattaName: regattaName,
        roundNumber: newRound
      });
    }
  }
  
  // If not found, create with round 1
  sheet.appendRow([regattaName, 1]);
  return createResponse(true, 'New regatta created with round 1', {
    regattaName: regattaName,
    roundNumber: 1
  });
}

// Store round information
function storeRoundInformation(params) {
  const regattaName = params.regattaName;
  const eventID = params.eventID;
  const roundNumber = params.roundNumber;
  const sheetID = params.sheetID || '';
  const raceDate = params.raceDate || '';
  const className = params.className || '';
  const competitorCount = params.competitorCount || '';
  const note = params.note || '';
  
  // Validate required fields
  if (!regattaName) {
    return createResponse(false, 'regattaName is required');
  }
  if (!eventID) {
    return createResponse(false, 'eventID is required');
  }
  if (!roundNumber) {
    return createResponse(false, 'roundNumber is required');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, 'Round Sheets', [
    'regattaName', 'eventID', 'roundNumber', 'sheetID', 
    'processedDate', 'raceDate', 'className', 'competitorCount', 'Note'
  ]);
  
  // Check if already exists
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === eventID && data[i][2] === roundNumber) {
      return createResponse(false, 'Round information already exists for this eventID', {
        existingData: {
          regattaName: data[i][0],
          eventID: data[i][1],
          roundNumber: data[i][2],
          sheetID: data[i][3],
          processedDate: data[i][4]
        }
      });
    }
  }
  
  // Add new row
  const row = [
    regattaName,
    eventID,
    roundNumber,
    sheetID,
    new Date(),
    raceDate,
    className,
    competitorCount,
    note
  ];
  
  sheet.appendRow(row);
  
  return createResponse(true, 'Round information stored successfully', {
    regattaName: regattaName,
    eventID: eventID,
    roundNumber: roundNumber
  });
}

// Check if round exists for an eventID
function checkRoundExists(params) {
  const eventID = params.eventID;
  
  if (!eventID) {
    return createResponse(false, 'eventID is required');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, 'Round Sheets', [
    'regattaName', 'eventID', 'roundNumber', 'sheetID', 
    'processedDate', 'raceDate', 'className', 'competitorCount', 'Note'
  ]);
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === eventID) {
      // Return the round number if found
      return createResponse(true, 'Round exists', {
        roundNumber: data[i][2]
      });
    }
  }
  
  // Return null if not found
  return createResponse(true, 'Round does not exist', { 
    roundNumber: null 
  });
}

// Get complete round data for an eventID
function getRoundData(params) {
  const eventID = params.eventID;
  
  if (!eventID) {
    return createResponse(false, 'eventID is required');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, 'Round Sheets', [
    'regattaName', 'eventID', 'roundNumber', 'sheetID', 
    'processedDate', 'raceDate', 'className', 'competitorCount', 'Note'
  ]);
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    Logger.log("event Id: " + data[i][1] + " param: " + params.eventID);
    if (data[i][1] === eventID) {
      // Return complete round data
      return createResponse(true, 'Round data retrieved', {
        regattaName: data[i][0],
        eventID: data[i][1],
        roundNumber: data[i][2],
        sheetID: data[i][3],
        processedDate: data[i][4],
        raceDate: data[i][5],
        className: data[i][6],
        competitorCount: data[i][7],
        note: data[i][8]
      });
    }
  }
  
  // Return null data if not found
  return createResponse(true, 'Round not found', { 
    regattaName: null,
    eventID: eventID,
    roundNumber: null,
    sheetID: null,
    processedDate: null,
    raceDate: null,
    className: null,
    competitorCount: null,
    note: null
  });
}

// Helper: Get or create sheet with headers
function getOrCreateSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

// Helper: Create JSON response
function createResponse(success, message, data = {}) {
  const response = {
    success: success,
    message: message,
    data: data,
    timestamp: new Date().toISOString()
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function resetRoundNumber(params) {
  const regattaName = params.regattaName;
  
  if (!regattaName) {
    return createResponse(false, 'regattaName is required');
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, 'Next Round', ['regattaName', 'roundNumber']);
  const data = sheet.getDataRange().getValues();
  
  // Find the regatta and reset its round tracking cell to 1
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === regattaName.toString()) {
      sheet.getRange(i + 1, 2).setValue(1);
      return createResponse(true, 'Round number reset to 1 for new season', {
        regattaName: regattaName,
        roundNumber: 1
      });
    }
  }
  
  // If it doesn't exist yet, simply initialize it with 1
  sheet.appendRow([regattaName, 1]);
  return createResponse(true, 'Regatta not found; initialized fresh with round 1', {
    regattaName: regattaName,
    roundNumber: 1
  });
}


// Initialize sheets (run this once manually)
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create Next Round sheet
  getOrCreateSheet(ss, 'Next Round', ['regattaName', 'roundNumber']);
  
  // Create Round Sheets sheet
  getOrCreateSheet(ss, 'Round Sheets', [
    'regattaName', 'eventID', 'roundNumber', 'sheetID', 
    'processedDate', 'raceDate', 'className', 'competitorCount', 'Note'
  ]);
  
  SpreadsheetApp.getUi().alert('Sheets initialized successfully!');
}