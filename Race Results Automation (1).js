//========================================
//// FILE: appsscript.html
//========================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Drive",
        "version": "v3",
        "serviceId": "drive"
      },
      {
        "userSymbol": "Calendar",
        "version": "v3",
        "serviceId": "calendar"
      }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "MYSELF"
  }
}

//========================================
//// FILE: config.gs
//========================================

/* config.gs
* Global configuration, property keys, and setter helpers.
*/

// Script property keys
const ROUND_TRACKER_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz2jZPC5w5P-tkkxZZNLfTmFOcirjZ_ctSbpCDYoOgcKJ-WspiVghIx0ZXZMo1yfG8AJw/exec';
const AUTOMATION_SHEET_ID = '1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI';
const PROP_GEMINI_API_KEY = "GEMINI_API_KEY";
const PROP_FACEBOOK_PAGE_ID = "FACEBOOK_PAGE_ID";
const PROP_FACEBOOK_PAGE_ACCESS_TOKEN = "FACEBOOK_PAGE_ACCESS_TOKEN";
const PROP_RESULTS_UPLOAD_FOLDER_ID = "RESULTS_UPLOAD_FOLDER_ID";
const PROP_MASTER_DATA_SPREADSHEET_ID = "MASTER_DATA_SPREADSHEET_ID";
const PROP_RESULTS_PROCESSED_FOLDER_ID = "RESULTS_PROCESSED_FOLDER_ID";
const PROP_OVERALL_RESULTS_FOLDER = "OVERALL_RESULTS_FOLDER";
const PROP_ARCHIVE_WORKBOOK_ID = "ARCHIVE_SHEET_ID";
const PROP_FACEBOOK_Q_ID = "FACEBOOK_Q_ID";
const PROP_CALENDAR_SPREADSHEET_ID = "CALENDAR_SPREADSHEET_ID"; // e.g., for 2025 calendar

// Sheets used in the master data spreadsheet (sheet names)
const SHEET_MEMBERS = "Members"; // columns: MemberID, Name, Email, Telephone, WhatsApp
const SHEET_CLASSES = "Classes"; // columns: ClassID, ClassName, Description
const SHEET_CLASSMEMBERS = "ClassMembers"; // columns: ClassID, MemberID, Sail No
const SHEET_REGATTAS = "Regattas"; // columns: RegattaID, RegattaName, StartDate, EndDate

// Helper setters - run these once from the Apps Script editor to store secrets
function setMasterConfig(masterSheetId, uploadFolderId, processedFolderId, overallResultsFolderId, raceArchivesID, calendarId,facebookQID) {
  if (masterSheetId) PropertiesService.getScriptProperties().setProperty(PROP_MASTER_DATA_SPREADSHEET_ID, masterSheetId);
  if (uploadFolderId) PropertiesService.getScriptProperties().setProperty(PROP_RESULTS_UPLOAD_FOLDER_ID, uploadFolderId);
  if (processedFolderId) PropertiesService.getScriptProperties().setProperty(PROP_RESULTS_PROCESSED_FOLDER_ID, processedFolderId);
  if (overallResultsFolderId) PropertiesService.getScriptProperties().setProperty(PROP_OVERALL_RESULTS_FOLDER, overallResultsFolderId);
  if (raceArchivesID) PropertiesService.getScriptProperties().setProperty(PROP_ARCHIVE_WORKBOOK_ID, raceArchivesID);
  if (facebookQID) PropertiesService.getScriptProperties().setProperty(PROP_FACEBOOK_Q_ID, facebookQID);
  if (calendarId) PropertiesService.getScriptProperties().setProperty(PROP_CALENDAR_SPREADSHEET_ID, calendarId);

  Logger.log('Master config stored.');
}

function setGeminiApiKey(geminiKeyId) {
  if (geminiKeyId) PropertiesService.getScriptProperties().setProperty(PROP_GEMINI_API_KEY, geminiKeyId);
  Logger.log('Gemini API key stored.');
}

function setFacebookSecrets(pageId, pageToken) {
  if (pageId) PropertiesService.getScriptProperties().setProperty(PROP_FACEBOOK_PAGE_ID, pageId);
  if (pageToken) PropertiesService.getScriptProperties().setProperty(PROP_FACEBOOK_PAGE_ACCESS_TOKEN, pageToken);
  Logger.log('Facebook secrets stored.');
}

function getProp(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v;
}

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {
    raceUploadFolderId: props.getProperty(PROP_RESULTS_UPLOAD_FOLDER_ID) || null,
    masterDataSpreadsheetId: props.getProperty(PROP_MASTER_DATA_SPREADSHEET_ID) || null,
    geminiKey: props.getProperty(PROP_GEMINI_API_KEY) || null,
    fbPageId: props.getProperty(PROP_FACEBOOK_PAGE_ID) || null,
    fbToken: props.getProperty(PROP_FACEBOOK_PAGE_ACCESS_TOKEN) || null,
    resultsProcessedFolderId: props.getProperty(PROP_RESULTS_PROCESSED_FOLDER_ID) || null,
    archiveWorkbookID: props.getProperty(PROP_ARCHIVE_WORKBOOK_ID) || null,
    overallFolderId: props.getProperty(PROP_OVERALL_RESULTS_FOLDER) || null,
    facebookQueueSheetId : props.getProperty(PROP_FACEBOOK_Q_ID) || null,
    calendarSpreadsheetId: props.getProperty(PROP_CALENDAR_SPREADSHEET_ID) || null
  };
}

/**
 * Sets a persistent property in the Script's property store.
 * used to store new Overall Results sheetIDs
 */
function setScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}


//========================================
//// FILE: masterData.gs
//========================================

/**
 * Public function to retrieve master data, utilizing the cache for performance.
 */

// Global variable for caching data across execution
let MASTER_DATA_CACHE = null;

function getMasterData() {
  if (MASTER_DATA_CACHE === null) {
    MASTER_DATA_CACHE = loadMasterData();
  }
  return MASTER_DATA_CACHE;
}

/**
* Loads master data from Club Management workbook
*/
function loadMasterData() {
  const cfg = getConfig();
  const id = cfg.masterDataSpreadsheetId;
  if (!id) throw new Error('MASTER DATA spreadsheet id not set (use setMasterConfig).');
  const ss = SpreadsheetApp.openById(id);



  // Members sheet: MemberID | Active | Name
  const members = sheetToObjects(ss, SHEET_MEMBERS, ['memberId', 'active', 'membername']);

  // Classes sheet: ClassID | ClassName
  const classes = sheetToObjects(ss, SHEET_CLASSES, ['classId', 'classname']);

  // ClassMembers: boatId | Active | MemberName | ClassName | SailNumber
  const allClassMembersRows = sheetToObjects(
    ss,
    SHEET_CLASSMEMBERS,
    ['boatId', 'active', 'membername', 'classname', 'sailnumber', 'model', 'handicap', 'hrn', 'gh', 'ghcap']
  );

  // Regattas: RegattaID | RegattaName | ClassName
  const regattas = sheetToObjects(ss, SHEET_REGATTAS, ['regattaId', 'regattaname', 'classname', 'type', 'weekofmonth', 'time', 'hcap formula', '<4', '<,7', '<13', '13+']);

  const classMembersRows = allClassMembersRows.filter(r => r.active);
  const ghMembersRows = allClassMembersRows.filter(r => r.gh);

  // --- 3. Build Lookup Maps ---
  const membersById = {};
  members.forEach(m => { if (m.memberId) membersById[m.memberId] = m; });

  const classesById = {};
  classes.forEach(c => { if (c.classId) classesById[c.classId] = c; });

  const classMembersMap = {}; // Key: ClassName, Value: Array of { membername, sailnumber, boatId }
  classMembersRows.forEach(r => {
    if (!classMembersMap[r.classname])
      classMembersMap[r.classname] = [];
      
    // Add the full member object (including boatId) into the array for the class
    classMembersMap[r.classname].push({
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId,
      hcap: r.handicap
    });
  });

  ghMembersRows.forEach(r => {
    if (!classMembersMap["General"])
      classMembersMap["General"] = [];
      
    // Add the full member object (including boatId) into the array for the class
    classMembersMap["General"].push({
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId,
      hcap: r.ghcap
    });
  });

  const regattasByName = {};
  regattas.forEach(r => regattasByName[(r.regattaName || '').toString().trim().toLowerCase()] = r);

  // --- 4. Return Comprehensive Data Structure ---
  return {
    members,
    membersById,
    classes,
    classesById,
    classMembersMap, // Grouped by class, includes boatId and is filtered for Active
    regattas,
    regattasByName
  };
}

function sheetToObjects(ss, sheetName, keys) {
  try {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    
    // Read all data in the sheet
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return []; // Only header row and empty data
    
    const results = [];
    // Start from row 2 (index 1) to skip header
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const obj = {};
      
      // Map column data to object keys
      for (let i = 0; i < keys.length; i++) {
        // Ensure we don't read past the actual data returned in this row
        const cellValue = (i < row.length) ? row[i] : null;
        
        // Handle empty strings safely
        obj[keys[i]] = (cellValue === '' || cellValue === undefined) ? null : cellValue;
      }
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error for ' + sheetName + ': ' + e);
    return [];
  }
}



//========================================
//// FILE: main.gs
//========================================

/**
* Orchestrator: scan upload folder for new files, parse, score, write and post
*/
function processNewRegattaSheets() {
  // get config data
  const cfg = getConfig();
  //const fbPageId = cfg.fbPageId;
  //const fbToken = cfg.fbToken;
  const uploadFolderId = cfg.raceUploadFolderId;
  if (!uploadFolderId) throw new Error('Upload folder id not configured.');
  
  const folder = DriveApp.getFolderById(uploadFolderId);
  const files = folder.getFiles();

  const md = getMasterData();

  while (files.hasNext()) {
    const file = files.next();
  // Skip already processed
    if ((file.getDescription() || '').includes('Processed by SMMC Admin AI')) continue;

    let parsed;

    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      const ss = SpreadsheetApp.openById(file.getId());
      parsed = parseSimplifiedRegattaSheet(ss);
    } else {
      continue; // skip unsupported files
    }

    // After getting parsed (from sheet or Gemini image)
    if(!parsed.eventID) {
      parsed.date = new Date(parsed.date); // Ensure it's a Date object

      // Lookup official EventID
      const officialEventID = lookupEventID(parsed.date, parsed.className);

      if (officialEventID) {
        parsed.eventID = officialEventID;
      } else {
        // Fallback: use filename or generated (as before)
        // But now you'll get a warning in logs for manual review
        console.log("No Event ID found, filename used")
        parsed.eventID = file.getName().replace(/\.[^.]+$/, '');
      }
    }

    var raceType = 'Scratch';
    const regattaName = (parsed.regattaName || '').trim();
    const regattaType = regattaName ? regattaName.split(' ').slice(1).join(' ') : '';
    if ((regattaName === 'IOM Racing') || regattaType === 'Handicap') {
      raceType = 'Handicap';
    }

  Logger.log("Class: " + parsed.className + " Race Type: " + raceType);

    //try {
      const sourceFileId = file.getId();              
      const ss = SpreadsheetApp.openById(sourceFileId);
    
      // 1. Parse the new sheet/file (returns raw data with sail numbers)
      let currentClassData = md.classMembersMap[parsed.className];

      // 2. Build scores
      const result = buildScoresFromRaces(parsed, currentClassData, raceType);

      // 3. Get or Create the Overall Results Sheet, scoping by Regatta Name
      const overallSheetID = getOrCreateOverall(parsed.regattaName, parsed, currentClassData, raceType); 

      // 4. Create the round sheet
      const roundResult = roundWrite(overallSheetID, result.scores, parsed, raceType);

      // ✅ NEW FIX: Ensure any new members are in the Overall sheet before appending scores
      ensureMembersInOverall(overallSheetID, result.scores, raceType);

      // 5. Add round to the Overall REsults sheet (and trigger series recalc)
      appendRound(overallSheetID, parsed, result.scores);
      applySeriesFormatting(overallSheetID, 'Overall Results');

      // 7. Add round to the Handicaps sheet
      if (raceType === 'Handicap') {
        appendHCRound(overallSheetID, parsed, result.updatedHandicaps);
        applySeriesFormatting(overallSheetID, 'Handicaps');
      }

      // 6. Mark the file as processed
      finalizeRaceResultsFile(file, parsed, overallSheetID, roundResult);

    //} 
    //  catch (e) {
    //  Logger.log(`ERROR processing file ${file.getName()}: ${e.message}`);
    //}
  };
}


/**
 * Rename and move processed race results file, and schedule Facebook post.
 */
function finalizeRaceResultsFile(file, parsed, overallSheetID, roundResult) {
  const cfg = getConfig();
  const archiveFolderId = cfg.resultsProcessedFolderId;
  if (!archiveFolderId) {
    Logger.log('ERROR: raceResultsProcessedFolderId is not configured. File move skipped.');
    return;
  }
  const archiveFolder = DriveApp.getFolderById(archiveFolderId);

  // 1. Update the file description to prevent re-processing
  const newDescription = `Processed by SMMC Admin AI ` + formatDate(new Date());
  try {
    file.setDescription(newDescription);
    Logger.log(`File description updated for processing flag: ${file.getName()}`);
  } catch (e) {
    Logger.log(`WARNING: Failed to update file description for ${file.getName()}. Error: ${e.message}`);
  }

  // 2. Move the file to the archive folder
  try {
    const newFile = file.moveTo(archiveFolder);
    Logger.log(`File archived successfully: ${newFile.getName()} moved to ${archiveFolder.getName()}`);
  } catch (e) {
    Logger.log(`ERROR: FAILED to archive file ${file.getName()}. Error: ${e.message}`);
  }

  // 3. Schedule Facebook post now that everything has been written successfully
  try {
    const fbQueueSheetId = cfg.facebookQueueSheetId;
    if (!fbQueueSheetId) {
      Logger.log('WARNING: Facebook queue sheet ID not configured. Post skipped.');
      return;
    }

    const overallSS = SpreadsheetApp.openById(overallSheetID);
    const roundSheetName = `Round ${roundResult.roundNumber}`;
    const roundSheet = overallSS.getSheetByName(roundSheetName);

    const fb = SpreadsheetApp.openById(fbQueueSheetId);
    const queue = fb.getSheetByName('Queue');

    queue.appendRow([
      'PENDING',
      overallSheetID,
      roundResult.sheetID,
      overallSS.getName(),
      roundSheetName,
      parsed.regattaName,
      parsed.date,
      parsed.raceReport,
      new Date(),
      '', '', '', ''
    ]);

    Logger.log(`${parsed.regattaName} Round ${roundResult.roundNumber} scheduled for Facebook post.`);
  } catch (e) {
    Logger.log(`WARNING: Failed to schedule Facebook post. Error: ${e.message}`);
  }
}


//========================================
//// FILE: parser.gs
//========================================

/**
* Parse a Race Results sheet and return structured object
*/
function parseSimplifiedRegattaSheet(ss) {
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

//========================================
//// FILE: scoring.gs
//========================================

/**
* Scoring routines — low-point system with discards
*/
function buildScoresFromRaces(parsed, membersData, raceType) {

  /* ---------------------------
   * Create roster
   * --------------------------- */
  const classname = parsed.className;

  if (membersData.length === 0)
    throw new Error('No competitors for class: ' + classname);

  /* ---------------------------
   * Determine race count
   * --------------------------- */
  const raceCount = parsed.races.length;
  const raceData = parsed.races;

  /* ---------------------------
   * Determine who raced at least once
   * --------------------------- */
  const sailResults = {};

  // Get all unique sail numbers across all races
  const allSailNumbers = new Set();
  
  raceData.forEach(race => {
    // Add all finishers
    race.positions.forEach(sailNum => allSailNumbers.add(sailNum));
    
    // Add DNS entries
    if (race.dns) {
      const dnsSails = Array.isArray(race.dns) ? race.dns : [race.dns];
      dnsSails.forEach(sailNum => {
        if (sailNum !== "") allSailNumbers.add(sailNum);
      });
    }
    
    // Add DNF entries
    if (race.dnf) {
      const dnfSails = Array.isArray(race.dnf) ? race.dnf : [race.dnf];
      dnfSails.forEach(sailNum => {
        if (sailNum !== "") allSailNumbers.add(sailNum);
      });
    }
    
    // Add RO entries
    if (race.raceRO && race.raceRO !== "") {
      const roSails = Array.isArray(race.raceRO) ? race.raceRO : [race.raceRO];
      roSails.forEach(sailNum => {
        if (sailNum !== "") allSailNumbers.add(sailNum);
      });
    }
  });
  
  // Convert membersData array to object indexed by sailnumber (if it's an array)
  let membersLookup = {};
  if (membersData) {
    if (Array.isArray(membersData)) {
      membersData.forEach(m => {
        if (m.sailnumber) {
          membersLookup[m.sailnumber] = m;
        }
      });
    } else {
      membersLookup = membersData;
    }
  }
  
  // Initialize results for each sail number
  allSailNumbers.forEach(sailNum => {
    const member = membersLookup[sailNum];
    
    sailResults[sailNum] = {
      sail: sailNum,
      member: member ? member.membername : "",
      boatId: member ? member.boatId : "",
      hcap: member ? member.hcap : 0,
      adj: 0,
      placements: [],
      racescore: [],
      gross: 0
    };
  });

  // Retrieve Regatta configuration using regattaName (assumption-free)
  const regattaConfig = getRegattaConfigByName(parsed.regattaName);
  // Determine which column to use based on competitor count
  const adjustmentColumn = getAdjustmentColumn(parsed.competitorCount);


  // Process each race
  raceData.forEach((race, raceIdx) => {
    // Calculate the number of starters in this race (for DNS/DNF scoring)
    const dnsScore = parsed.competitorCount + 1;
    const dnfScore = dnsScore;
    
    // Track which sail numbers we've processed in this race
    const processedInRace = new Set();
    
    // Process finishers (positions)
    race.positions.forEach((sailNum, index) => {
      const position = index + 1;
      sailResults[sailNum].placements.push(position);
      sailResults[sailNum].racescore.push(position);
      processedInRace.add(sailNum);
    });
    
    // Process DNS
    if (race.dns) {
      const dnsSails = Array.isArray(race.dns) ? race.dns : [race.dns];
      dnsSails.forEach(sailNum => {
        if (sailNum !== "" && sailResults[sailNum]) {
          sailResults[sailNum].placements.push('DNS');
          sailResults[sailNum].racescore.push(dnsScore);
          processedInRace.add(sailNum);
        }
      });
    }
    
    // Process DNF
    if (race.dnf) {
      const dnfSails = Array.isArray(race.dnf) ? race.dnf : [race.dnf];
      dnfSails.forEach(sailNum => {
        if (sailNum !== "" && sailResults[sailNum]) {
          sailResults[sailNum].placements.push('DNF');
          sailResults[sailNum].racescore.push(dnfScore);
          processedInRace.add(sailNum);
        }
      });
    }
    
    // Process Race Officers (RO) - they get average points
    if (race.raceRO && race.raceRO !== "") {
      const roSails = Array.isArray(race.raceRO) ? race.raceRO : [race.raceRO];
      roSails.forEach(sailNum => {
        if (sailNum !== "" && sailResults[sailNum]) {
          // Calculate average score for this competitor
          // Average is calculated from their other races (excluding RO duties)
          const otherRaceScores = sailResults[sailNum].racescore.filter(score => 
            typeof score === 'number' && score > 0
          );
          
          let averageScore;
          if (otherRaceScores.length > 0) {
            const sum = otherRaceScores.reduce((acc, score) => acc + score, 0);
            averageScore = Math.round(sum / otherRaceScores.length);
          } else {
            // If no other races, use average of all finishers + 1
            averageScore = Math.round((parsed.competitorCount + 1) / 2) + 1;
          }
          
          sailResults[sailNum].placements.push('RO');
          sailResults[sailNum].racescore.push(averageScore);
          processedInRace.add(sailNum);
        }
      });
    }

    // Handicaps
    if (raceType === 'Handicap') {
      // Only loop over finishers
      race.positions.forEach((sailNum, index) => {
        const position = index + 1;
        if (parsed.regattaName == 'IOM Racing' && index < 3) {
          return;
        }     
 
        // Compute the handicap adjustment
        const adjustment = getHcapAdjustment({
          position,
          competitorCount: parsed.competitorCount,
          formula: regattaConfig['Hcap Formula'],
          adjustmentRow: regattaConfig[adjustmentColumn]
        });

        Logger.log(
          `Boat ${sailNum} Position ${position} Adjustment ${adjustment}`
        );

        // Update ADJUSTMENT
        sailResults[sailNum].adj = sailResults[sailNum].adj + adjustment;
      });
    }
    
  });
  
  // Calculate gross totals
  Object.keys(sailResults).forEach(sailNum => {
    const result = sailResults[sailNum].racescore;
    sailResults[sailNum].gross = result.reduce((sum, score) => sum + score, 0);
  });

  // Convert to array and sort by gross score
  const scores = Object.values(sailResults);
  scores.sort((a, b) => a.gross - b.gross);
  
  const updatedHandicaps = Object.values(sailResults).map(r => ({
    member: r.member,
    boatId: r.boatId,  
    hcap: r.hcap,
    adj: r.adj
  }));


  /* ---------------------------
   * Discards & totals
   * --------------------------- */
  const discardCount = getDiscardCount(raceCount);

  scores.forEach(sc => {
    // 1. Map scores to objects so we can track their original index after sorting
    const indexedScores = sc.racescore.map((score, index) => ({
      score: score,
      index: index
    }));

    // 2. Sort by score descending (highest scores first are the candidates for discard)
    indexedScores.sort((a, b) => b.score - a.score);

    // 3. Initialize the discards array with 'false' for all races
    sc.discards = new Array(raceCount).fill(false);
    let discardedSum = 0;

    // 4. Mark the top N scores as discarded
    for (let i = 0; i < discardCount; i++) {
      const discardIndex = indexedScores[i].index;
      sc.discards[discardIndex] = true; // Mark this specific race as a discard
      discardedSum += indexedScores[i].score;
    }

    // 5. Calculate net total
    sc.net = sc.gross - discardedSum;
  });
  
  scores.sort((a, b) => a.net - b.net);

  return {
    scores,
    updatedHandicaps
  };
}



//========================================
//// FILE: ScoringHelpers.gs
//========================================

function parseHcapFormula(formula) {
  return formula.split(',').map(t => t.trim());
}

function getAdjustmentColumn(count) {
  if (count < 4) return '<4';
  if (count < 7) return '<7';
  if (count < 13) return '<13';
  return '13+';
}

function resolveFormulaToken(position, competitorCount, tokens) {
  const last = competitorCount;

  // 1. If it is the absolute last boat, always return 'L'
  if (position === last) return 'L';

  // 2. If the position is within our defined fixed tokens (1, 2, 3, 4, n)
  // and that token isn't the 'L' marker, use it.
  if (position <= tokens.length) {
    const token = tokens[position - 1];
    if (token !== 'L') return token;
  }
  // 3. Otherwise, check if we are "close" to the end (L-1, L-2)
  // Or default to 'n' (the last non-L token)
  const offset = last - position;
  const offsetToken = `L-${offset}`;
  
  // If L-1 exists in our formula, use it. 
  // If not, default to 'n' so middle boats aren't ignored.
  return tokens.includes(offsetToken) ? offsetToken : 'n';
}

function getHcapAdjustment({
  position,
  competitorCount,
  formula,
  adjustmentRow
  }) {
    const tokens = parseHcapFormula(formula);
    // Ensure we handle empty rows or bad data by defaulting to [0]
    const adjustments = adjustmentRow ? adjustmentRow.split(',').map(Number) : [0];
    
    // 1. Resolve the token
    let token = resolveFormulaToken(position, competitorCount, tokens);
    let index = tokens.indexOf(token);

    // 2. Robust Fallback
    if (index === -1) {
      if (position === competitorCount) {
        // If it's the last boat and 'L' is missing, try to find the last available adjustment
        index = tokens.length - 1;
      } else {
        // If it's a middle boat, try 'n'. If 'n' doesn't exist, default to the 5th token (index 4)
        let nIndex = tokens.indexOf('n');
        index = (nIndex !== -1) ? nIndex : Math.min(4, tokens.length - 1);
      }
    }

    Logger.log(
      JSON.stringify({
        position,
        competitorCount,
        formula,
        adjustmentRow
    })
    );

    Logger.log(
      JSON.stringify({
        token,
        index,
        result: adjustments[index]
      })
    );

  // 3. Final Safety Check: Ensure index is never -1 and within array bounds
  if (index < 0 || index >= adjustments.length) return 0;

  const result = adjustments[index];
  return isNaN(result) ? 0 : result;
}


/**
 * Finds the number of discards allowed
 */
function getDiscardCount(length) {
    if (length < 4) return 0; // 1 discard after 4
    if (length < 8) return 1; // 2 discards after 8
    return 2 + Math.floor((length - 8) / 8); // 2 Discards after 8 + one more for every 8 thereafter
}

function updateClassMemberHandicaps(updatedHandicaps, className) {
  const ss = SpreadsheetApp.openById(AUTOMATION_SHEET_ID);
  const sheet = ss.getSheetByName('ClassMembers');
  if (!sheet) throw new Error('ClassMembers sheet not found');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = name => headers.indexOf(name);

  const boatIdCol  = col('BoatID');
  const activeCol  = col('Active');
  const classCol   = col('Class');
  const hcapCol    = col('Handicap');
  const ghHcapCol  = col('GH HCap');

  if (boatIdCol === -1 || activeCol === -1 || classCol === -1)
    throw new Error('Required columns missing in ClassMembers');

  const targetCol = className === 'General' ? ghHcapCol : hcapCol;
  if (targetCol === -1) throw new Error('Target handicap column not found');

  const hcapMap = {};
  updatedHandicaps.forEach(r => {
    if (!r.boatId) return;                  
    if (r.adj === 0) return;                
    hcapMap[String(r.boatId)] = Math.max(0, r.hcap + r.adj);
  });

  // Create an array specifically for the target handicap column
  // It matches the exact height of our rows (excluding header row index 0)
  const handicapColumnValues = [];
  let updates = 0;

  for (let i = 1; i < data.length; i++) {
    // Default to keeping the existing value in the spreadsheet
    let finalValue = data[i][targetCol]; 

    // Check if the boat meets the update criteria
    if (data[i][activeCol] === true && data[i][classCol] === className) {
      const boatId = String(data[i][boatIdCol]);
      if (boatId in hcapMap) {
        finalValue = hcapMap[boatId];
        updates++;
      }
    }
    
    // Push into our single-column update array
    handicapColumnValues.push([finalValue]);
  }

  // Only write to the target column range, leaving the 'Active' checkbox column completely untouched
  if (updates > 0) {
    // Row start: 2 (to skip headers), Column start: targetCol + 1 (1-indexed)
    sheet.getRange(2, targetCol + 1, handicapColumnValues.length, 1).setValues(handicapColumnValues);
    Logger.log(`Handicaps updated for ${updates} boat(s) in class: ${className}`);
  } else {
    Logger.log(`No handicap updates needed for class: ${className}`);
  }

  return updates;
}

function snapshotClassMembers_(sheet) {
  const ts = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );

  const ss = sheet.getParent();
  const snap = ss.insertSheet(`ClassMembers SNAP ${ts}`);
  snap.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
      .setValues(sheet.getDataRange().getValues());
}

function getRegattaConfigByName(regattaName) {
  const ss = SpreadsheetApp.openById(AUTOMATION_SHEET_ID);
  const sheet = ss.getSheetByName('Regattas');
  if (!sheet) throw new Error('Regattas sheet not found');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const col = name => headers.indexOf(name);

  const nameCol     = col('ChampionshipName');
  const formulaCol  = col('Hcap Formula');
  const lt4Col      = col('<4');
  const lt7Col      = col('<7');
  const lt13Col     = col('<13');
  const gte13Col    = col('13+');

  if (
    nameCol === -1 ||
    formulaCol === -1 ||
    lt4Col === -1 ||
    lt7Col === -1 ||
    lt13Col === -1 ||
    gte13Col === -1
  ) {
    throw new Error('One or more required columns missing in Regattas sheet');
  }

  for (let i = 1; i < data.length; i++) {
    if (data[i][nameCol] === regattaName) {
      return {
        'Hcap Formula': data[i][formulaCol],
        '<4':  data[i][lt4Col],
        '<7':  data[i][lt7Col],
        '<13': data[i][lt13Col],
        '13+': data[i][gte13Col]
      };
    }
  }

  throw new Error(`Regatta configuration not found for ${regattaName}`);
}


//========================================
//// FILE: rankScores.gs
//========================================

function rankScoresMap(scoreMap) {
  // Clone to avoid mutating original
  const ranked = scoreMap;

  let currentRank = 1;
  ranked[0].rank = currentRank;

  for (let i = 1; i < ranked.length; i++) {
    const prev = ranked[i - 1];
    const curr = ranked[i];

    if (compareCompetitors(prev, curr) === 0) {
      // Ex Aequo
      curr.rank = prev.rank;
    } else {
      currentRank = i + 1;
      curr.rank = currentRank;
    }
  }

  return ranked;
}

function compareCompetitors(a, b) {
  // 1. Total score
  if (a.net !== b.net) {
    return a.net - b.net;
  }

  // 2. A8.1 – best scores
  const a81 = compareA81(a, b);
  if (a81 !== 0) return a81;

  // 3. A8.2 – last race, then backwards
  const a82 = compareA82(a, b);
  if (a82 !== 0) return a82;

  // 4. Ex Aequo
  return 0;
}

function compareA81(a, b) {
  const as = [...a.racescore].sort((x, y) => x - y);
  const bs = [...b.racescore].sort((x, y) => x - y);

  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] !== bs[i]) {
      return as[i] - bs[i]; // lower is better
    }
  }
  return 0;
}

function compareA82(a, b) {
  for (let i = a.racescore.length - 1; i >= 0; i--) {
    if (a.racescore[i] !== b.racescore[i]) {
      return a.racescore[i] - b.racescore[i];
    }
  }
  return 0;
}


//========================================
//// FILE: createOverall.gs
//========================================

/**
 * Finds or creates an Overall Results sheet for a regatta type
 */
function getOrCreateOverall(regattaName, parsed, members, raceType) {
  
  // 1. Fetch the season from the "Variables" sheet, cell E2
  const ss = SpreadsheetApp.openById(AUTOMATION_SHEET_ID);
  const variablesSheet = ss.getSheetByName("Variables");
    // Check if the Variables sheet actually exists first
  if (!variablesSheet) {
    throw new Error("The 'Variables' sheet could not be found.");
  }
  const season = variablesSheet.getRange("E2").getValue();

  // 2. Different Regattas have different Overall Results sheets, including season
  const overallResultsWorksheet = 'Overall Results ' + regattaName + " " + season;
  const propertyKey = `regattaWorkbookId_${overallResultsWorksheet}`;
  const seriesWorkbookId = getProp(propertyKey);

  if (seriesWorkbookId) {
    return seriesWorkbookId;
  }

  const cfg = getConfig();
  const overallFolderId = cfg.overallFolderId;
  if (!overallFolderId) {
    Logger.log('ERROR: Overall Folder Id is not configured. File move skipped.');
    return; // Stop if the configuration is missing
  }
  const overallFolder = DriveApp.getFolderById(overallFolderId); 
  const newFile = SpreadsheetApp.create(overallResultsWorksheet); 
  newFile.getSheets()[0].setName('Overall Results')
  
  if (raceType === 'Handicap') {
    const lastPosition = newFile.getNumSheets();
    newFile.insertSheet('Handicaps', lastPosition);
  }
  const newId = newFile.getId();
  const movefile = DriveApp.getFileById(newId);
  movefile.moveTo(overallFolder);

  // Save the new ID 
  setScriptProperty(propertyKey, newId); 

  Logger.log(`Created new Overall Results Workbook: ${overallResultsWorksheet} (ID: ${newId}) in folder Overall Results Sheets`);

  //Reset Round Number if regatta rounds exist
  var nextRoundNumber = getNextRoundNumber(regattaName);
  if (nextRoundNumber !== 1) {
    var roundReset = resetRoundNumber(regattaName)
    if (roundReset) {
      console.log('Round for ${regattaName} reset to 1');
    }
    else {
      console.log('Error resetting round for ${regattaName}');
     }
  }

  // Populate the Headings and members
  overallSetup(newId, parsed, members, raceType);
  return newId;
}

function overallSetup(bookID, parsed, members, raceType) {
  const ss = SpreadsheetApp.openById(bookID);
  
  // Create Overall Results
  let sh = ss.getSheetByName('Overall Results');

  // Setup Metadata Labels
  sh.getRange("B2:C2").merge().setValue('Last Race:');
  sh.getRange("D2").setValue(0);
  sh.getRange("B3:C3").merge().setValue('Rounds:');
  sh.getRange("D3").setValue(0);
  sh.getRange("G2").setValue('DNC').setHorizontalAlignment('right');

  // Headers
  var headers = [['Att', 'Sail #', 'Member Name', 'Rank', 'Total', 'Discard']];
  sh.getRange("B5:G5").setValues(headers);

  // Populate Members
  const memberData = members.map(m => ['', m.sailnumber, m.membername, '', '', '']);
  if (memberData.length > 0) {
    sh.getRange(6, 2, memberData.length, 6).setValues(memberData);
    const lastRow = 5 + memberData.length;
    if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  }
  let rules = sh.getConditionalFormatRules();
  const range = sh.getRange(6,2, memberData.length,6);
  const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground('#FFF9C4') // light yellow
    .setRanges([range])
    .build();

  rules.push(evenRowRule);
  sh.setConditionalFormatRules(rules);

  if (raceType === 'Handicap') {
    // create Handicap sheet
    let hs = ss.getSheetByName('Handicaps');    
    let hsRules = hs.getConditionalFormatRules();
    const hsRange = hs.getRange(6,2, memberData.length,6);
    const hsEvenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground('#FFF9C4') // light yellow
    .setRanges([hsRange])
    .build();

    // Setup Metadata Labels
    hs.getRange("B2:C2").merge().setValue('Last Race:');
    hs.getRange("D2").setValue(0);
    hs.getRange("B3:C3").merge().setValue('Rounds:');
    hs.getRange("D3").setValue(0);

    // Headers
    headers = [['Att', 'Sail #', 'Member Name', 'Starting Hcap','Adj','Current Hcap']];
    hs.getRange("B5:G5").setValues(headers);

    // Populate Members
    const memberHcapData = members.map(m => ['', m.sailnumber, m.membername, m.hcap, '', '']);
    if (memberData.length > 0) {
      hs.getRange(6, 2, memberHcapData.length, 6).setValues(memberHcapData);
      const lastRow = 5 + memberHcapData.length;
      if (hs.getMaxRows() > lastRow) hs.deleteRows(lastRow + 1, hs.getMaxRows() - lastRow);
    } 
    hsRules.push(hsEvenRowRule);
    hs.setConditionalFormatRules(hsRules);
  }
  console.log('File setup for ' + memberData.length + ' competitors');
}

//========================================
//// FILE: roundSheet.gs
//========================================

/**
 * Writes the results for a single round to its own sheet in the regatta book.
 * Base version includes Discard bracket logic, UI formatting, and Config registration.
 * @param {string} bookID The ID of the target spreadsheet.
 * @param {object} rankedScores The calculated scores for the round.
 * @param {object} parsed The object containing parsed regatta data.
 */
function roundWrite(bookID, rankedScores, parsed, raceType) {
  if (!rankedScores || !rankedScores.length) return;
  const ss = SpreadsheetApp.openById(bookID);

  const eventID = parsed.eventID;

// === Determine round number and whether this is a correction ===
  
  // const existing = getCurrentRoundInfo(eventID);
  const existing = checkRoundExists(eventID);
  const isCorrection = existing !== null;

  let roundNumber;

  if (isCorrection) {
    roundNumber = existing;
    console.log(`Correction for eventID ${eventID} → reusing Round ${roundNumber}`);
  } else {
    roundNumber = getNextRoundNumber(parsed.regattaName);
    incrementRoundNumber(parsed.regattaName);
    console.log(`New round for eventID ${eventID} → Round ${roundNumber}`);
  }
  const roundSheetName = `Round ${roundNumber}`;
  const sheets = ss.getSheets();

  // 1. Find the current Round sheet
  const currentRoundSheet = ss.getSheetByName(roundSheetName);

  if (currentRoundSheet) {

    // 2. Find existing "Old" sheets for this round
    const oldSheets = sheets
      .map(s => s.getName())
      .filter(name =>
        name === `${roundSheetName} Old` ||
        name.startsWith(`${roundSheetName} Old `)
      );

    // 3. Determine next Old index
    let nextOldIndex = 1;

    if (oldSheets.length > 0) {
      const indices = oldSheets.map(name => {
        const match = name.match(/Old\s*(\d+)?$/);
        return match && match[1] ? Number(match[1]) : 1;
      });

      nextOldIndex = Math.max(...indices) + 1;
    }

    // 4. Rename and archive existing Round sheet
    const oldName =
      nextOldIndex === 1
        ? `${roundSheetName} Old`
        : `${roundSheetName} Old ${nextOldIndex}`;

    currentRoundSheet.setName(oldName);
    currentRoundSheet.hideSheet();
    console.log(`Original sheet renamed and hidden, new name ${oldName} `)
  }

  // 5. Create the new Round sheet
  const sh = ss.insertSheet(roundSheetName);
  const sheetID = sh.getSheetId();

  // --- Round Metadata ---
  const processedDate = new Date();

  // --- Compute performance stats per competitor ---
  const statsData = rankedScores.map(sc => {
    let wins = 0, podiums = 0, top5 = 0;
    sc.placements.forEach(val => {
      if (val === 1) wins++;
      if (val > 0 && val <= 3) podiums++;
      if (val > 0 && val <= 5) top5++;
    });
    return [wins, podiums, top5];
  });

  // --- Round Sheet Header ---
  const raceCount = rankedScores[0].racescore.length;
  const startRow = 7;
  const startCol = 2;
  const header = ["Pos", "Sail #", "Competitor", "Result"];
  for (let i = 1; i <= raceCount; i++) header.push(`R${i}`);
  header.push("Total", "Drop", "W", "T3", "T5");
  const totalCols = header.length;
  const totalColIdx = startCol + totalCols - 5;
  
  sh.setHiddenGridlines(true);
  // --- Metadata UI ---
  sh.getRange("B3:H3")
  .merge()
    .setValue(`${parsed.regattaName} - Round ${roundNumber}`)
    .setFontSize(16).setFontWeight("bold").setBackground("#4A86E8")
    .setFontColor("white").setHorizontalAlignment("left").setVerticalAlignment("left");

  sh.getRange("B4:D4")
  .merge()
  .setValue(parsed.date)
  .setHorizontalAlignment("left");

  sh.getRange(3, totalColIdx)
  .setValue(parsed.competitorCount)
  .setHorizontalAlignment("center")
  .setVerticalAlignment("center");
  
  sh.getRange(3, totalColIdx + 1,1,1)
    .merge()
    .setValue("Boats")
    .setHorizontalAlignment("left")
    .setVerticalAlignment("center");

  sh.getRange(4, totalColIdx)
    .setValue(raceCount)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("center");

  sh.getRange(4, totalColIdx + 1,1,1)
  .merge()
  .setValue("Races")
  .setHorizontalAlignment("left")
  .setVerticalAlignment("center");
  
  // remove archive records if a correction
  
  const cfg = getConfig();
  const cfgsheetID = cfg.archiveWorkbookID
  const archiveSS = SpreadsheetApp.openById(cfgsheetID);
  const archiveSheet = archiveSS.getSheetByName("RaceResultsArchive") || archiveSS.insertSheet("RaceResultsArchive");
  
if (isCorrection) {
  const data = archiveSheet.getDataRange().getValues();
  const archiveHeader = data.shift(); // removes header row, data is now 0-indexed body rows
  
  const idxEvent  = archiveHeader.indexOf("EventID");
  const idxRound  = archiveHeader.indexOf("SeriesRoundNumber");

  if (idxEvent === -1 || idxRound === -1) {
    Logger.log('WARNING: Archive headers not found — skipping archive cleanup.');
  } else {
    const rowsToDelete = [];

    data.forEach((row, i) => {
      if (
        String(row[idxEvent]).trim()  === String(eventID).trim() &&
        Number(row[idxRound])         === Number(roundNumber)
      ) {
        rowsToDelete.push(i + 2); // +2 because we shifted the header (body is 1-indexed, +1 for header)
      }
    });

    // Delete bottom-up so row indices stay valid as rows are removed
    rowsToDelete.reverse().forEach(r => archiveSheet.deleteRow(r));
    Logger.log(`Deleted ${rowsToDelete.length} archive row(s) for EventID: ${eventID}, Round: ${roundNumber}`);
  }

  parsed.raceReport = "*** Adjusted *** " + parsed.raceReport;
}

  // --- Populate Round Sheet & Build Archive Rows ---
  const dataRows = [header];
  const archiveRows = [];
  rankedScores.forEach((sc, index) => {
    const row = [index + 1, sc.sail, sc.member, sc.net];
    sc.placements.forEach((p, rIdx) => {
      const val = (sc.discards && sc.discards[rIdx] === true) ? "'(" + p + ")" : p;
      row.push(val);

      // --- Archive row per competitor per race ---
      archiveRows.push([
        parsed.eventID,
        parsed.regattaName || "",
        raceType,
        parsed.date,
        processedDate,
        roundNumber,
        parsed.className || "",
        parsed.competitorCount,
        sc.boatID || "",
        sc.member || "",
        sc.sail || "",
        rIdx + 1, // race number within round
        sc.placements[rIdx],        // race placing
        sc.racescore[rIdx],         // points for this race
        (sc.discards[rIdx] === true) ? sc.racescore[rIdx] : 0,
        sc.racescore[rIdx],
        (sc.discards[rIdx] === true) ? sc.racescore[rIdx] : 0,
        (sc.discards[rIdx] === true) ? 0 : sc.racescore[rIdx],
        "", "", "", "", "", "",
        ((sc.gross - sc.net) / (sc.net || 1)),            // discard dependency
        ((typeof sc.placements[rIdx] === 'number') ? sc.placements[rIdx] : parsed.competitorCount / parsed.competitorCount)  * 100,              // percentile
        (sc.placements[rIdx] <= 3) ? 1 : 0,               // podiums
        parsed.competitorCount,
        true,
        ""
      ]);
    });

    row.push(sc.gross, sc.gross - sc.net, ...statsData[index]);
    dataRows.push(row);
  });

  // --- Write Round Sheet ---
  sh.getRange(startRow, startCol, dataRows.length, totalCols).setValues(dataRows);
  const lastRow = startRow + dataRows.length - 1;
  const lastCol = startCol + totalCols - 1;
  if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  if (sh.getMaxColumns() > lastCol) sh.deleteColumns(lastCol + 1, sh.getMaxColumns() - lastCol);

  applyRoundCardFormatting(sh);

  // === Update metadata — overwrites previous entry for this eventID ===
  storeRoundInformation(parsed.regattaName, eventID, roundNumber, {
    sheetID: sheetID,
    raceDate : parsed.date,
    className : parsed.className,
    competitorCount : parsed.competitorCount,
    note: isCorrection ? `Corrected on ${new Date().toISOString().split('T')[0]}` : ""
  });

  console.log(`Round ${roundNumber} processed successfully (EventID: ${parsed.eventID})`);

  // --- Write Archive Sheet ---
  archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, archiveRows.length, archiveRows[0].length)
              .setValues(archiveRows);
  console.log(`Round ${roundNumber} races processed to Archives (EventID: ${parsed.eventID})`);

return { sheetID, roundNumber };
}


//========================================
//// FILE: appendRound.gs
//========================================

/*************************************
 * Add Round to Overall sheet.
 * ******************************** */ 
function appendRound(bookID, parsed, rankedScores) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName('Overall Results');
  
  const lastRow = sh.getLastRow();
  const roundCount = checkRoundExists(parsed.eventID);
  if (lastRow < 6 || roundCount <= 0) return;

  let roundColIdx = 7 + roundCount;
  let roundLabel = "Round " + roundCount;

  // 3. Calculate DNC
  const compCount = Number(parsed.competitorCount) || 0;
  const raceCount = rankedScores[0].racescore ? rankedScores[0].racescore.length : 1;
  const dncScore = (compCount + 1) * raceCount;

  // 4. Map Scores to Members (Matching 'member' and returning 'net')

  const memberNames = sh.getRange(6, 4, lastRow - 5, 1).getValues().flat();
  
  const scoresToPoint = memberNames.map(sheetName => {
    const cleanSheetName = String(sheetName).trim().toLowerCase();
    
    const match = rankedScores.find(rs => {
      // Matching against 'member' property
      const cleanRankedName = String(rs.member).trim().toLowerCase();
      return cleanRankedName === cleanSheetName;
    });

    if (match) {
      // Returning 'net' property
      return [match.net];
    } else {
      return [dncScore];
    }
  });

  // 5. Write Data to Overall Results
  const expectedLastRow = 5 + scoresToPoint.length;
  if (sh.getMaxRows() < expectedLastRow) {
    sh.insertRowsAfter(sh.getMaxRows(), expectedLastRow - sh.getMaxRows());
  }
  
  sh.getRange(2, roundColIdx).setValue(dncScore);
  sh.getRange(3, roundColIdx).setValue(parsed.date);
  sh.getRange(5, roundColIdx).setValue(roundLabel);
  sh.getRange(6, roundColIdx, scoresToPoint.length, 1).setValues(scoresToPoint);

  sh.getRange("B2").setValue("Last race:");
  sh.getRange("D2").setValue(parsed.date);
  sh.getRange("B3").setValue("Round:");
  sh.getRange("D3").setValue(roundCount);

  // recalculateOverall(bookID, roundCount);
  /********************************************************
   * Recalculate the Overall scores.
   * *************************************************** */  
  const discardNeeded = getDiscardCount(roundCount);
 
  // Load Metadata and Scores
  const dncValues = sh.getRange(2, 8, 1, roundCount).getValues()[0];
  const scoreRange = sh.getRange(6, 8, lastRow - 5, roundCount).getValues();

  const finalCalculations = scoreRange.map(rowScores => {
    let attendanceCount = 0;
    let totalGross = 0;
    let validScores = [];

    rowScores.forEach((score, idx) => {
      if (typeof score === 'number') {
        const dncThreshold = dncValues[idx];
        if (score < dncThreshold) attendanceCount++;
        totalGross += score;
        validScores.push(score);
      }
    });
    
    const sortedScores = [...validScores].sort((a, b) => b - a);
    const discardSum = sortedScores.slice(0, discardNeeded).reduce((a, b) => a + b, 0);
    const netTotal = totalGross - discardSum;

    return {
      attendance: attendanceCount,
      net: netTotal,
      discard: discardSum
    };
  });

  const attendanceData = finalCalculations.map(res => [res.attendance]);
  sh.getRange(6, 2, attendanceData.length, 1).setValues(attendanceData);

  const summaryData = finalCalculations.map(res => [res.net, res.discard]);
  sh.getRange(6, 6, summaryData.length, 2).setValues(summaryData);

  // Sort new scores (assuming headers in row 1)

  const lastCol = sh.getLastColumn();
  
  // Get the data range (exclude header row)
  const dataRange = sh.getRange(6, 2, lastRow - 5, lastCol-1);
  
  const totalColumn = 6; // Total column position
  
  dataRange.sort({
    column: totalColumn,
    ascending: true // Lowest total score = best rank
  });

  // Update Rank column (column E) with new rankings
  const rankRange = sh.getRange(6, 5, lastRow - 5, 1);
  const newRanks = [];
  
  for (let i = 1; i <= lastRow - 5; i++) {
    newRanks.push([i]);
  }
  rankRange.setValues(newRanks);
  console.log("Overall scores recalculated successfully.");

  /*********************************************************
   * Rank the scores now the new round data is calculated in
   * 
   * ******************************************************/ 

  // 1. Get Data for the Tie-Breaker "scoreMap"
  // Column C: Name, Column E: Net Total, Col G+: Individual Rounds
  const names = sh.getRange(6, 4, lastRow - 5, 1).getValues().flat();
  const netTotals = sh.getRange(6, 6, lastRow - 5, 1).getValues().flat();
  const roundScores = sh.getRange(6, 8, lastRow - 5, roundCount).getValues();


  // 2. Construct the data structure for the tie-breaker
  const scoreMap = names.map((name, i) => {
    return {
      membername: name,
      totalScore: netTotals[i], 
      racescore: roundScores[i].filter(s => typeof s === 'number')
    };
  });

  // 3. Call existing Tie-Breaker logic
  // This assumes the function you use for Round Results is available
  const scoresRanked = rankScoresMap(scoreMap); 

  // 4. Map the calculated ranks back to the spreadsheet rows
  const finalRanks = names.map(name => {
    const match = scoresRanked.find(rs => rs.membername === name);
    return [match ? match.rank : ""];
  });

  // 5. Write Ranks (Col D) and Sort the Sheet
  sh.getRange(6, 5, finalRanks.length, 1).setValues(finalRanks);
  sh.getRange(6, 2, lastRow - 5, lastCol).sort({column: 5, ascending: true});
  
  console.log("Ranking and Protection applied successfully.");
}


/*************************************
 * Add Round to Handicaps sheet.
 * ******************************** */ 
function appendHCRound(bookID, parsed, handicaps) {
  const ss = SpreadsheetApp.openById(bookID);
  const hs = ss.getSheetByName('Handicaps');
  const hsLastRow = hs.getLastRow();
  const roundCount = checkRoundExists(parsed.eventID);
  
  if (hsLastRow < 6 || roundCount <= 0) return;
  let roundColIdx = 7 + roundCount;
  let roundLabel = "Round " + roundCount;
    

  const hcapMemberNames = hs.getRange(6, 4, hsLastRow - 5, 1).getValues().flat();
  // Map handicaps to Members (Matching 'member' and returning 'adj')
  const hcapToPoint = hcapMemberNames.map(sheetName => {
    const trimSheetName = String(sheetName).trim().toLowerCase();
    
    const match = handicaps.find(rs => {
      // Matching against 'member' property
      const trimRankedName = String(rs.member).trim().toLowerCase();
      return trimRankedName === trimSheetName;
    });

    if (match) {
      // Returning 'adj' property
      return [match.adj];
    } else {
      return ['-'];
    }
  });

  // 6. Write Data to Handicaps
  hs.getRange(3, roundColIdx).setValue(formatDate(parsed.date));
  hs.getRange(5, roundColIdx).setValue(roundLabel);
  hs.getRange(6, roundColIdx, hcapToPoint.length, 1).setValues(hcapToPoint);

  hs.getRange("B2").setValue("Last race:");
  hs.getRange("D2").setValue(formatDate(parsed.date));
  hs.getRange("B3").setValue("Round:");
  hs.getRange("D3").setValue(roundCount);

  /********************************************************
   * Recalculate the Handicap sheet.
   * *************************************************** */
  // 7. recalculate the Handicaps sheet
  const hcapRange = hs.getRange(6, 8, hsLastRow - 5, roundCount).getValues();

  const finalHandicaps = hcapRange.map(rowScores => {
    let attendanceCount = 0;
    let totaladj = 0;

    rowScores.forEach((hcap, idx) => {
      if (typeof hcap === 'number') {
        attendanceCount++;
        totaladj += hcap;
      } 
    });

    return {
      attendance: attendanceCount,
      adj: totaladj,
    };
  });

  const attendanceHcap = finalHandicaps.map(res => [res.attendance]);
  hs.getRange(6, 2, attendanceHcap.length, 1).setValues(attendanceHcap);

  const summaryHcap = finalHandicaps.map(res => [res.adj]);
  hs.getRange(6, 6, summaryHcap.length, 1).setValues(summaryHcap);

  const curHcapRange = hs.getRange(6,7,hsLastRow - 5,1);
  const curHcaps = [];
  for (let i = 6; i <= hsLastRow; i++) {
    if (typeof hs.getRange(i, 5).getValue() === 'number') {
      currentHcap = Math.max(0, hs.getRange(i, 5).getValue() + hs.getRange(i, 6).getValue());
      curHcaps.push([currentHcap]);
    } else {
      curHcaps.push([0]);
    }
  }
  curHcapRange.setValues(curHcaps);

  // Sort the Handicaps
  const hslastCol = hs.getLastColumn();
  const hcapSort = hs.getRange(6, 2, hsLastRow - 5, hslastCol -1);
  const hcapColumn = 7; // Total column position
  
  hcapSort.sort({ 
    column: hcapColumn,
    ascending: false // Lowest total score = best rank
  });

  console.log(roundLabel + " added to Handicaps to Overall Results sheet");

  console.log("===== Handicap adjustments =====");
  handicaps.forEach(h => {
    console.log(
      JSON.stringify({
        member: h.member,
        boatId: h.boatId,
        hcap: h.hcap,
        adj: h.adj
      })
    );
  });
  updateClassMemberHandicaps(handicaps, parsed.className);
  console.log("Handicaps updated");
}

//========================================
//// FILE: utils.gs
//========================================

/** Utility helpers */
function formatDate(d){
return d ? Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
}

function tryNormalizeDate(dateRaw) {
    if (!dateRaw) return null;

    // 1. Convert the raw string into a Date object.
    const date = new Date(dateRaw);

    if (!isNaN(date.getTime())) {
        // We do NOT use UTC methods like getUTCMonth() or toISOString() 
        // to ensure we keep the local date (Nov 08, not Nov 07).

        // Get the local day, month, and year.
        const year = date.getFullYear();
        // Month is 0-indexed (0 = Jan, 10 = Nov), so add 1
        const month = date.getMonth() + 1; 
        const day = date.getDate();

        // Helper function to pad single-digit numbers with a leading zero.
        const pad = (num) => String(num).padStart(2, '0');

        // Format and return as MM/DD/YYYY
        // Note: The original code also had a call to formatDate(date), 
        // which has been removed as it's not defined and likely unnecessary
        // with the new formatting logic.
        return `${pad(day)}/${pad(month)}/${year}`;
    }

    // Return raw string if normalization fails
    return dateRaw; 
}

/************************************
* Round Processing Utilities
************************************/
// List all processed rounds (for debugging or admin menu)
function listProcessedRounds() {
  console.log(getProcessedRounds());
}

// Remove a round (e.g., if imported wrong)
function removeProcessedRound(eventID) {
  const rounds = getProcessedRounds();
  if (rounds.hasOwnProperty(eventID)) {
    delete rounds[eventID];
    saveProcessedRounds(rounds);
  }
}

// Get sheet object from stored sheetID
function getRoundSheetByEventID(eventID) {
  const sheetID = getSheetIDForEvent(eventID);
  if (!sheetID) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets().find(s => s.getSheetId() === sheetID);
}

//========================================
//// FILE: helpers.gs
//========================================

/**
 * Checks the Overall Results sheet for missing members and adds them,
 * backfilling any previously completed rounds with the DNC score for that round.
 */
function ensureMembersInOverall(bookID, rankedScores, raceType) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName('Overall Results');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  // Get existing member names from column D
  const existingNames = lastRow >= 6
    ? sh.getRange(6, 4, lastRow - 5, 1).getValues().flat().map(n =>
        String(n).trim().toLowerCase())
    : [];

  // Find members in this round's scores who aren't in the sheet yet
  const newMembers = rankedScores.filter(sc =>
    sc.member && !existingNames.includes(String(sc.member).trim().toLowerCase())
  );

  if (newMembers.length === 0) return;

  Logger.log(`Found ${newMembers.length} new member(s) to add to Overall Results: ` +
    newMembers.map(m => m.member).join(', '));

  // --- Determine how many rounds have already been recorded ---
  // Round DNC values are stored in row 2 starting at column 8 (H)
  // Each round column has its DNC score written by appendRound at sh.getRange(2, roundColIdx)
  const roundColStart = 8; // Column H is where round data begins
  const completedRoundCount = lastCol >= roundColStart ? lastCol - roundColStart : 0;

  // Read the DNC values for each completed round from row 2
  let dncByRound = [];
  if (completedRoundCount > 0) {
    dncByRound = sh.getRange(2, roundColStart, 1, completedRoundCount)
                   .getValues()[0];
  }

  // --- Append new member rows ---
  const insertAt = lastRow + 1;
  const newRows = newMembers.map(m => ['', m.sail, m.member, '', '', '']);
  sh.getRange(insertAt, 2, newRows.length, 6).setValues(newRows);

  // --- Backfill completed rounds with DNC scores ---
  if (completedRoundCount > 0) {
    newMembers.forEach((m, rowOffset) => {
      const sheetRow = insertAt + rowOffset;
      const dncFill = dncByRound.map(dncVal => [dncVal]);

      // Write the DNC value into each completed round column for this new member
      sh.getRange(sheetRow, roundColStart, 1, completedRoundCount)
        .setValues([dncByRound.map(dncVal => dncVal)]);

      Logger.log(`Backfilled ${completedRoundCount} round(s) with DNC for: ${m.member}`);
    });
  }

  // --- Reapply even-row conditional formatting across full body ---
  const newLastRow = sh.getLastRow();
  const fullBodyRange = sh.getRange(6, 2, newLastRow - 5, 6);
  const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground('#FFF9C4')
    .setRanges([fullBodyRange])
    .build();
  sh.setConditionalFormatRules([evenRowRule]);

  // --- Mirror into Handicaps sheet if needed ---
  if (raceType === 'Handicap') {
    const hs = ss.getSheetByName('Handicaps');
    if (hs) {
      const hsLastRow = hs.getLastRow();
      const hsExistingNames = hsLastRow >= 6
        ? hs.getRange(6, 4, hsLastRow - 5, 1).getValues().flat().map(n =>
            String(n).trim().toLowerCase())
        : [];

      const hsNewMembers = newMembers.filter(m =>
        !hsExistingNames.includes(String(m.member).trim().toLowerCase())
      );

      if (hsNewMembers.length > 0) {
        const hsInsertAt = hsLastRow + 1;
        const hsNewRows = hsNewMembers.map(m => ['', m.sail, m.member, m.hcap || 0, '', '']);
        hs.getRange(hsInsertAt, 2, hsNewRows.length, 6).setValues(hsNewRows);

        // Backfill Handicaps sheet rounds with '-' (no adjustment, they weren't there)
        const hsLastCol = hs.getLastColumn();
        const hsCompletedRounds = hsLastCol >= roundColStart ? hsLastCol - roundColStart : 0;
        if (hsCompletedRounds > 0) {
          hsNewMembers.forEach((m, rowOffset) => {
            const hsSheetRow = hsInsertAt + rowOffset;
            const blankFill = Array(hsCompletedRounds).fill('-');
            hs.getRange(hsSheetRow, roundColStart, 1, hsCompletedRounds)
              .setValues([blankFill]);
          });
        }

        const hsNewLastRow = hs.getLastRow();
        const hsFullBodyRange = hs.getRange(6, 2, hsNewLastRow - 5, 6);
        const hsEvenRowRule = SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=ISEVEN(ROW())')
          .setBackground('#FFF9C4')
          .setRanges([hsFullBodyRange])
          .build();
        hs.setConditionalFormatRules([hsEvenRowRule]);

        Logger.log(`Added ${hsNewMembers.length} new member(s) to Handicaps sheet.`);
      }
    }
  }

  Logger.log('New member rows inserted and backfilled successfully.');
}

/**
 * Looks up the EventID from the Annual Calendar spreadsheet
 * by matching ClassName and Date (exact match on date)
 * Assumes: Sheet named "Event Data", Column A = EventID, Column B = Date, Column C = ClassName (or adjust columns)
 *
 * @param {Date} raceDate - The parsed race date (JavaScript Date object)
 * @param {string} className - The parsed class name
 * @return {string|null} EventID or null if not found
 */
function lookupEventID(raceDate, className) {
  const cfg = getConfig();
  const calendarId = cfg.calendarSpreadsheetId;
  if (!calendarId) {
    Logger.log('WARNING: Calendar spreadsheet ID not configured.');
    return null;
  }

  const ss = SpreadsheetApp.openById(calendarId);
  const sheet = ss.getSheetByName('Event Data');
  if (!sheet) {
    Logger.log('ERROR: Sheet "Event Data" not found in calendar spreadsheet.');
    return null;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null; // No data

  // Assume headers in row 1
  // Adjust these column indices if your layout differs:
  const EVENTID_COL = 0;   // Column A (index 0)
  const DATE_COL = 1;      // Column B
  const CLASS_COL = 2;     // Column C

  const targetDateStr = Utilities.formatDate(raceDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  for (let i = 1; i < data.length; i++) { // Start from row 2
    const rowDate = data[i][DATE_COL];
    const rowClass = (data[i][CLASS_COL] || '').toString().trim();
    const rowEventID = (data[i][EVENTID_COL] || '').toString().trim();

    if (!rowEventID) continue;

    let rowDateStr = '';
    if (rowDate instanceof Date) {
      rowDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (typeof rowDate === 'string') {
      rowDateStr = rowDate.trim();
    }

    if (rowDateStr === targetDateStr && rowClass.toLowerCase() === className.toLowerCase()) {
      Logger.log(`Found EventID ${rowEventID} for ${className} on ${targetDateStr}`);
      return rowEventID;
    }
  }

  Logger.log(`No EventID found for ${className} on ${targetDateStr}`);
  return null;
}

function findMemberByClassAndSail(className, sail, classMembersMap) {
  if (!className || !sail) return null;

  // Use the cached version
  const classKey = className.toString().trim();

  const boats = classMembersMap[classKey];
  if (!boats || boats.length === 0) return null;

  const sailStr = sail.toString().trim();

  // Find the boat where the sail number matches the provided sail number string
  return boats.find(b =>
    b.sailnumber &&
    b.sailnumber.toString().trim() === sailStr
  ) || null;
}

/**
 * Finds the value corresponding to a label in a key:value sheet format.
 * Expects label in column A and value in column B.
 */
function findLabelValue(values, label) {
    // 1. Prepare the search label once, making it lowercase and clean.
    const searchLabel = (label || '').toLowerCase().trim();

    // Handle empty search label scenario
    if (searchLabel === '') {
        return null;
    }

    // 2. Iterate through each row in the 2D array 'values'.
    for (let r = 0; r < values.length; r++) {
        const row = values[r];
        
        // 3. Iterate through each cell (column) in the current row.
        // We stop one cell before the end because we need to return the value
        // *to the right* (at index c + 1).
        for (let c = 0; c < row.length - 1; c++) {
            
            // 4. Get the cell value, clean it (trim, remove colon, lowercase),
            // and ensure it's a string for comparison.
            const cellValue = (row[c] || '').toString().trim().replace(':', '').toLowerCase();
            
            // 5. Check if the cleaned cell value contains the search label.
            if (cellValue.includes(searchLabel)) {
                
                // 6. If found, return the value from the cell immediately to the right.
                // It's wrapped in a toString().trim() for consistency.
                return (row[c + 1] || '').toString().trim();
            }
        }
    }

    // 7. If the label is not found after checking all cells, return null.
    return null;
}


function lockSheetForAutomation(sheet) {
  if (!sheet) return;
  
  // Remove existing protections to prevent conflicts
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (let i = 0; i < protections.length; i++) {
    protections[i].remove();
  }

  const protection = sheet.protect().setDescription('Automation Locked');
  
  // Ensure only the person running the script (you) can edit
  const me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors());
  
  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}


//========================================
//// FILE: formatting.gs
//========================================

function applySeriesFormatting(sheetID, raceType) {
  const ss = SpreadsheetApp.openById(sheetID);
  const sh = ss.getSheetByName(raceType);

  console.log(sh.getSheetName() + " " + sh.getSheetId() + " "  + sheetID)
  console.log (sh.getSheetName());
  console.log (sh.getMaxRows());
  
  const lastRow = Math.max(sh.getMaxRows(), 6);
  const lastCol = Math.max(sh.getMaxColumns(), 7);

  // Prevent invalid ranges
  if (lastRow < 6 || lastCol < 1) {
    console.log('applySeriesFormatting: not enough data to format');
    return;
  }

  const hdrRow = 5;
  const lastHdrCol = 7;
  const bodyRowStart = 6;
  const roundColStart = lastHdrCol + 1;

  const bodyCount = Math.max(0, lastRow - bodyRowStart + 1);
  const roundColCount = Math.max(0, lastCol - lastHdrCol);

  // 1. Header sizing
  sh.setRowHeight(1, 10);
  sh.setColumnWidth(1, 10);
  sh.setColumnWidth(2, 25);
  sh.setColumnWidth(3, 50);
  sh.setRowHeight(4, 10);

  // 2. Header styling
  if (lastCol >= 7) {
    sh.getRange("B5:G5")
      .setBackground("#4A86E8")
      .setFontColor("white")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  }

  // 3. Metadata alignment
  sh.getRange("B2:B3").setHorizontalAlignment("left");
  sh.getRange("D2:D3").setHorizontalAlignment("left");

  if (lastCol >= 7) {
    sh.getRange("G2").setHorizontalAlignment("right");
  }

  // 4. Body alignment
  if (bodyCount > 0) {
    // Attended & Sail
    sh.getRange(bodyRowStart, 2, bodyCount, 2)
      .setHorizontalAlignment("center");

    // Rank, Total, Discard
    if (lastCol >= 7) {
      sh.getRange(bodyRowStart, 5, bodyCount, 3)
        .setHorizontalAlignment("center");
    }

    // Names
    sh.getRange(bodyRowStart, 4, bodyCount, 1)
      .setHorizontalAlignment("left")
      .setWrap(false);

    // Resize key columns
    sh.autoResizeColumn(4);
    let width = sh.getColumnWidth(4);
    sh.setColumnWidth(4, width + 30);

    [5, 6, 7].forEach(col => {
      if (col <= lastCol) {
        sh.autoResizeColumn(col);
        sh.setColumnWidth(col, sh.getColumnWidth(col) + 5);
      }
    });
  }

  // 5. Round column formatting
  if (roundColCount > 0 && lastRow > 1) {
    const roundRange = sh.getRange(
      2,
      roundColStart,
      lastRow - 1,
      roundColCount
    );
    roundRange.setHorizontalAlignment("center");

    // Round headers
    sh.getRange(hdrRow, roundColStart, 1, roundColCount)
      .setBackground("#4A86E8")
      .setFontColor("white")
      .setFontWeight("bold");

    // Resize round columns
    for (let c = roundColStart; c <= lastCol; c++) {
      sh.autoResizeColumn(c);
      sh.setColumnWidth(c, sh.getColumnWidth(c) + 5);
    }
  }

  // 6. Trim extra columns
  const maxCols = sh.getMaxColumns();
  if (maxCols > lastCol) {
    sh.deleteColumns(lastCol + 1, maxCols - lastCol);
  }
}


function applyRoundCardFormatting(sh) {
  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  const hdrCols = 5;
  const hdrRow = 7;
  const hdrColStart = 2;
  const bodyRowStart = hdrRow + 1;
  const bodyCount = lastRow - hdrRow + 1;
  const raceColStart = hdrCols + 1;
  const raceColEnd = lastCol - 5;


  // 1. Specific Pixel Sizing for Margins
  sh.setColumnWidth(1, 10);                           // Column A spacer
  [1, 2, 5, 6].forEach(r => sh.setRowHeight(r, 10));  // Rows 1, 2, 5, 6 spacers

  // 2. Header formatting
  // Main headers
  sh.getRange("C3").  // Round Header
    setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  sh.getRange("C4").setHorizontalAlignment("left");  // Round date

  // Columns outside of set header columns need to be dynamic
  sh.getRange(3,raceColEnd + 1,1,1).setHorizontalAlignment("center").setVerticalAlignment("center");
  sh.getRange(4,raceColEnd + 1,1,1).setHorizontalAlignment("center").setVerticalAlignment("center"); 
  sh.getRange(3,raceColEnd + 2,1,1).setHorizontalAlignment("left").setVerticalAlignment("center"); 
  sh.getRange(4,raceColEnd + 2,1,1).setHorizontalAlignment("left").setVerticalAlignment("center");  

  // Body headers
  sh.getRange(hdrRow,hdrColStart,1,lastCol - hdrColStart +1).
    setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  

  // 3. Table Body Alignment
  // Center everything by default
  sh.getRange(hdrRow, hdrColStart, bodyCount, lastCol - hdrColStart +1)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  // 4. 1st place Highlights (Gold)
  const raceRange = sh.getRange(bodyRowStart, raceColStart, bodyCount -1, raceColEnd - raceColStart +1);
  const values = raceRange.getValues();
  const bgs = values.map(row => row.map(cell => {
    let score = parseInt(String(cell).replace(/\(|\)/g, ''));
    if (score === 1) return "#FFD700";
    return null;
  }));
  raceRange.setBackgrounds(bgs);

  // 5. Final Column Width Adjustments
  sh.autoResizeColumns(hdrColStart, lastCol - 1); // Initial resize for text fit
  
  // Left-align Competitor names and autosize (Column D)
  sh.getRange(hdrRow, 4, bodyCount, 1).setHorizontalAlignment("left").setWrap(false)    
  sh.autoResizeColumn(4);                    // First, fit exactly to content
  const currentWidth = sh.getColumnWidth(4); // Get the auto-resized width
  const margin = 30;                         // Add your desired margin (pixels)
  sh.setColumnWidth(4, currentWidth + margin);
  sh.setColumnWidth(3, 50); // Force narrow Sail # column
  
  // UNIFORM RACE COLUMNS:
  // Start at column 6 (F), affect the number of race columns
  sh.setColumnWidths(raceColStart, (raceColEnd - raceColStart) + 1, 45); 

  // 6. Dark grey font for cells containing '('  (typically discarded scores)
  if (raceRange) {
    const values = raceRange.getValues();
    const fontColors = raceRange.getFontColors(); // Preserve existing colors or create new grid

    let changesMade = false;
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < values[i].length; j++) {
        if (typeof values[i][j] === 'string' && values[i][j].includes('(')) {
          fontColors[i][j] = '#c6c1c1';  // Dark grey (adjust hex as needed)
          changesMade = true;
        }
      }
    }

    if (changesMade) {
      raceRange.setFontColors(fontColors);
    }
  }


}

//========================================
//// FILE: Round WebApp.gs
//========================================

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

//========================================
//// FILE: tests.gs
//========================================

const CONFIG = {
  SheetID: "18c2johld4J7gzkoSH63qp6qh7w--6t-1F_94vs4tBoc",
  SheetName: "Overall Results"
}

function test() {
  example(CONFIG.SheetID, CONFIG.SheetName);
}

function example(spreadsheetId,   sheetName) {
const ss = SpreadsheetApp.openById(spreadsheetId);
const sheet = ss.getSheetByName(sheetName);
console.log (sheet.getLastRow());
console.log (sheet.getLastColumn());
console.log (sheet.getSheetName());
console.log (sheet.getMaxRows());

}


