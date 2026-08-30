// Race Result Automation - Round Tracker Integration
// Google Apps Script version

// ============================================================================
// INTERNAL FUNCTIONS - Called by your Race modules
// These return only the data needed, no messages
// ============================================================================

/**
 * Get the next round number for a regatta
 * Called by Race modules to determine which round to create
 * @param {string} regattaName - Name of the regatta
 * @returns {number} The next round number
 */
function getNextRoundNumber(regattaName) {
  try {
    const response = callRoundTrackerAPI('getNextRound', { regattaName: regattaName });
    
    if (response.success) {
      return response.data.roundNumber;
    } else {
      Logger.log('Failed to get next round: ' + response.message);
      throw new Error('Unable to retrieve next round number');
    }
  } catch (error) {
    Logger.log('Error in getNextRound: ' + error);
    throw error;
  }
}

/**
 * Check if an event has already been processed
 * @param {string} eventID - Event ID to check
 * @returns {number|null} Round number if exists, null if not found
 */
function checkRoundExists(eventID) {
  try {
    const response = callRoundTrackerAPI('checkRoundExists', { eventID: eventID });
    
    if (response.success) {
      return response.data.roundNumber; // Will be number or null
    } else {
      Logger.log('Failed to check event: ' + response.message);
      return null; // Return null on error to allow processing
    }
  } catch (error) {
    Logger.log('Error in checkEventProcessed: ' + error);
    return null; // Return null on error to allow processing
  }
}

/**
 * Get complete round data for an event
 * @param {string} eventID - Event ID to retrieve
 * @returns {Object|null} Round data object or null if not found
 */
function getCurrentRoundInfo(eventID) {
  try {
    const response = callRoundTrackerAPI('getRoundData', { eventID: eventID });
    Logger.log("Response: " + response + " roundNumber: " + response.data.roundNumber);

    if (response.success && response.data.roundNumber !== null) {
      return {
        regattaName: response.data.regattaName,
        eventID: response.data.eventID,
        roundNumber: response.data.roundNumber,
        sheetID: response.data.sheetID,
        processedDate: response.data.processedDate,
        raceDate: response.data.raceDate,
        className: response.data.className,
        competitorCount: response.data.competitorCount,
        note: response.data.note
      };
    } else {
      return null;
    }
  } catch (error) {
    Logger.log('Error in getRoundData: ' + error);
    return null;
  }
}

/**
 * Record round information after successful processing
 * @param {string} regattaName - Name of the regatta
 * @param {string} eventID - Event ID
 * @param {number} roundNumber - Round number
 * @param {Object} info - Additional information (sheetID, raceDate, className, etc.)
 * @returns {boolean} True if successfully recorded
 */
function storeRoundInformation(regattaName, eventID, roundNumber, info) {
  info = info || {};
  
  try {
    const payload = {
      regattaName: regattaName,
      eventID: eventID,
      roundNumber: roundNumber,
      sheetID: info.sheetID || '',
      raceDate: info.raceDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      className: info.className || '',
      competitorCount: info.competitorCount || 0,
      note: info.note || ''
    };
    
    const response = callRoundTrackerAPI('storeRoundInfo', payload);
    
    if (response.success) {
      return true;
    } else {
      Logger.log('Failed to record round: ' + response.message);
      return false;
    }
  } catch (error) {
    Logger.log('Error in recordRound: ' + error);
    return false;
  }
}

/**
 * Increment the round counter for a regatta
 * Called after successfully processing a round
 * @param {string} regattaName - Name of the regatta
 * @returns {boolean} True if successfully incremented
 */
function incrementRoundNumber(regattaName) {
  try {
    const response = callRoundTrackerAPI('incrementRound', { regattaName: regattaName });
    
    if (response.success) {
      return true;
    } else {
      Logger.log('Failed to increment round: ' + response.message);
      return false;
    }
  } catch (error) {
    Logger.log('Error in incrementRound: ' + error);
    return false;
  }
}


function resetRoundNumber(regattaName) {
  try {
    const response = callRoundTrackerAPI('resetRound', { regattaName: regattaName });
    
    if (response.success) {
      return true;
    } else {
      Logger.log('Failed to reset round: ' + response.message);
      return false;
    }
  } catch (error) {
    Logger.log('Error in resetRound: ' + error);
    return false;
  }
}

/**
 * Make API call to Round Tracker web app
 * @param {string} action - Action to perform
 * @param {Object} params - Parameters for the action
 * @returns {Object} Parsed response object
 */
function callRoundTrackerAPI(action, params) {
  try {
    const payload = Object.assign({ action: action }, params);
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(ROUND_TRACKER_WEB_APP_URL, options);
    const result = JSON.parse(response.getContentText());
    
    return result;
    
  } catch (error) {
    Logger.log('Error calling Round Tracker API: ' + error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE USAGE - How your Race modules should use these functions
// ============================================================================

/**
 * Example: Race Result Processing Module
 */
function exampleRaceModule() {
  const regattaName = "Summer Series 2025";
  const eventID = "EVENT_12345";
  
  // Step 1: Check if already processed
  const existingRound = checkEventProcessed(eventID);
  if (existingRound !== null) {
    Logger.log('Event already processed in round ' + existingRound + '. Skipping.');
    return;
  }
  
  // Step 2: Get next round number
  const roundNumber = getNextRound(regattaName);
  Logger.log('Processing round ' + roundNumber);
  
  // Step 3: Process race results
  // ... your race result processing code here ...
  const resultSheetID = 'SHEET_12345'; // from your processing
  const competitors = 24; // from your data
  
  // Step 4: Record the round information
  const recorded = recordRound(regattaName, eventID, roundNumber, {
    sheetID: resultSheetID,
    raceDate: '2025-01-15',
    className: 'Laser',
    competitorCount: competitors,
    note: 'Strong winds, 3 races completed'
  });
  
  if (!recorded) {
    Logger.log('Warning: Failed to record round information');
  }
  
  // Step 5: Increment round counter for next time
  const incremented = incrementRound(regattaName);
  if (!incremented) {
    Logger.log('Warning: Failed to increment round counter');
  }
  
  Logger.log('Race processing completed successfully');
}

/**
 * Example: Creating a new round sheet
 */
function exampleCreateRoundSheet() {
  const regattaName = "Winter Championship 2025";
  
  // Get the next round number to create
  const roundNumber = getNextRound(regattaName);
  
  // Create your round sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const newSheet = ss.insertSheet('Round ' + roundNumber);
  
  Logger.log('Created sheet for Round ' + roundNumber);
  
  return roundNumber;
}

/**
 * Example: Retrieve and display round data
 */
function exampleGetRoundData() {
  const eventID = "EVENT_12345";
  
  const roundData = getRoundData(eventID);
  
  if (roundData !== null) {
    Logger.log('Round Data Found:');
    Logger.log('  Regatta: ' + roundData.regattaName);
    Logger.log('  Round: ' + roundData.roundNumber);
    Logger.log('  Sheet ID: ' + roundData.sheetID);
    Logger.log('  Race Date: ' + roundData.raceDate);
    Logger.log('  Class: ' + roundData.className);
    Logger.log('  Competitors: ' + roundData.competitorCount);
    Logger.log('  Note: ' + roundData.note);
    Logger.log('  Processed: ' + roundData.processedDate);
  } else {
    Logger.log('No round data found for event: ' + eventID);
  }
  
  return roundData;
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * Test internal functions
 */
function testInternalFunctions() {
  try {
    Logger.log('=== Testing Internal Functions ===');
    
    const testRegatta = 'Test Regatta ' + new Date().getTime();
    const testEventID = 'TEST_' + new Date().getTime();
    
    // Test 1: Get next round
    Logger.log('Test 1: Get next round...');
    const round = getNextRound(testRegatta);
    Logger.log('✓ Got round: ' + round + ' (type: ' + typeof round + ')');
    
    // Test 2: Check non-existent event
    Logger.log('Test 2: Check non-existent event...');
    const notFound = checkEventProcessed('NONEXISTENT_123');
    Logger.log('✓ Result: ' + notFound + ' (should be null)');
    
    // Test 3: Get round data for non-existent event
    Logger.log('Test 3: Get round data for non-existent event...');
    const noData = getRoundData('NONEXISTENT_123');
    Logger.log('✓ Result: ' + noData + ' (should be null)');
    
    // Test 4: Record round
    Logger.log('Test 4: Record round...');
    const recorded = recordRound(testRegatta, testEventID, round, {
      sheetID: 'SHEET_TEST_123',
      raceDate: '2025-01-15',
      className: 'Test Class',
      competitorCount: 10,
      note: 'Test note'
    });
    Logger.log('✓ Recorded: ' + recorded + ' (should be true)');
    
    // Test 5: Check existing event
    Logger.log('Test 5: Check existing event...');
    const found = checkEventProcessed(testEventID);
    Logger.log('✓ Found round: ' + found + ' (should be ' + round + ')');
    
    // Test 6: Get complete round data
    Logger.log('Test 6: Get complete round data...');
    const roundData = getRoundData(testEventID);
    Logger.log('✓ Retrieved data:');
    Logger.log('  - Regatta: ' + roundData.regattaName + ' (should be ' + testRegatta + ')');
    Logger.log('  - Round: ' + roundData.roundNumber + ' (should be ' + round + ')');
    Logger.log('  - Sheet ID: ' + roundData.sheetID + ' (should be SHEET_TEST_123)');
    Logger.log('  - Class: ' + roundData.className + ' (should be Test Class)');
    Logger.log('  - Count: ' + roundData.competitorCount + ' (should be 10)');
    
    // Test 7: Increment round
    Logger.log('Test 7: Increment round...');
    const incremented = incrementRound(testRegatta);
    Logger.log('✓ Incremented: ' + incremented + ' (should be true)');
    
    // Test 8: Verify increment worked
    Logger.log('Test 8: Verify increment...');
    const nextRound = getNextRound(testRegatta);
    Logger.log('✓ Next round: ' + nextRound + ' (should be ' + (round + 1) + ')');
    
    Logger.log('=== All Tests Passed! ===');
    
  } catch (error) {
    Logger.log('✗ Test failed: ' + error);
    Logger.log('Please check your ROUND_TRACKER_WEB_APP_URL is set correctly.');
  }
}

/**
 * Quick connection test
 */
function testConnection() {
  try {
    const testRegatta = 'Connection Test';
    const round = getNextRound(testRegatta);
    Logger.log('✓ Connected! Next round for "' + testRegatta + '" is: ' + round);
  } catch (error) {
    Logger.log('✗ Connection failed: ' + error);
  }
}