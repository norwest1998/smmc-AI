/**
 * Public function to retrieve master data, utilizing the cache for performance.
 * @returns {object} The cached master data object.
 */
/* config.gs
* Global configuration, property keys, and setter helpers.
*/

let MASTER_DATA_CACHE = null;
function getMasterData() {
  if (MASTER_DATA_CACHE === null) {
    MASTER_DATA_CACHE = loadMasterData();
  }
  return MASTER_DATA_CACHE;
}

let EVENT_DATA_CACHE = null;
function getEventData() {
  if (EVENT_DATA_CACHE === null) {
    EVENT_DATA_CACHE = loadEventData();
  }
  return EVENT_DATA_CACHE;
}

let LEADERBOARD_CACHE = null;
function getLeaderboard(champName) {
  if (LEADERBOARD_CACHE === null) {
    LEADERBOARD_CACHE = loadLeaderboard(champName);
  }
  if(LEADERBOARD_CACHE.name !== "None found") {
    var regattaName = LEADERBOARD_CACHE.name;
  }
  if (!regattaName === champName )  {
    LEADERBOARD_CACHE = loadLeaderboard(champName);
  }
  return LEADERBOARD_CACHE;
}


/***** CONFIGURATION CONSTANTS *****/

// Names of sheets in the *Race Results* spreadsheet
const RESULTS_TEMPLATE_SHEET_NAME = "Race Results Template";
const CURRENT_REGATTA_SHEET_NAME  = "Current Regatta";
const CONFIG_SHEET_NAME = "Config";
const TARGET_SHEET_NAME = CONFIG_SHEET_NAME;

// Target cell for the selected EventID (hexkey)
const CURRENT_REGATTA_EVENT_ID_CELL = "A1";

// Columns in the external Event Data sheet (zero-based indices)
const COL_EVENT_ID    = 0; // Column A: EventID / hexkey
const COL_MONTH    = 1  // Col B : Month 
const COL_DATE        = 2; // Column C: Date
const COL_START    = 3; // Column D: Start (unused here)
const COL_FINISH   = 4; // Column E: Finish (unused here)
const COL_IMAGE    = 5; // Column F: Image (unused here)
const COL_CLASS       = 7; // Column G: Class
const COL_REGATTA_TYP = 8; // Column H: Regatta Type
const COL_COMP     = 9; // Column I: Competition (unused)

// IMPORTANT: "Event Name" for the dropdown label
// At the moment we use Regatta Type as the event name.
// If you later add a dedicated Event Name column, change this.
const COL_EVENT_NAME  = COL_REGATTA_TYP;

// Property key for label → EventID mapping
const EVENT_MAP_PROPERTY_KEY = "eventMap";

// Logging switch
const PROCESS_LOGGING = true;


// Script property keys
const PROP_GEMINI_API_KEY = "GEMINI_API_KEY";
const PROP_MASTER_DATA_SPREADSHEET_ID = "MASTER_DATA_SPREADSHEET_ID";
const PROP_WEATHER_DATA_SPREADSHEET_ID = "WEATHER_DATA_SPREADSHEET_ID";
const PROP_RACE_UPLOAD_FOLDER_ID = "RACE_UPLOAD_FOLDER_ID";

// Keys used in the master data spreadsheet (sheet names)
const SHEET_MEMBERS = "Members"; // columns: MemberID, Name, Email, Telephone, WhatsApp
const SHEET_CLASSES = "Classes"; // columns: ClassID, ClassName, Description
const SHEET_CLASSMEMBERS = "ClassMembers"; // columns: ClassID, MemberID, Sail No
const SHEET_REGATTAS = "Regattas"; // columns: RegattaID, RegattaName, StartDate, EndDate

// Helper setters - run these once from the Apps Script editor to store secrets
function setMasterConfig(masterSheetId, uploadFolderId, geminiKeyId, weatherSheetId) {
  if (masterSheetId) PropertiesService.getScriptProperties().setProperty(PROP_MASTER_DATA_SPREADSHEET_ID, masterSheetId);
  if (weatherSheetId) PropertiesService.getScriptProperties().setProperty(PROP_MWEATHER_DATA_SPREADSHEET_ID, weatherSheetId);
  if (uploadFolderId) PropertiesService.getScriptProperties().setProperty(PROP_RACE_UPLOAD_FOLDER_ID, uploadFolderId);
  if (geminiKeyId) PropertiesService.getScriptProperties().setProperty(PROP_GEMINI_API_KEY, geminiKeyId);
  Logger.log('Master config stored.');
}

function getProp(k) {
const v = PropertiesService.getScriptProperties().getProperty(k);
return v;
}

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {
    masterDataSpreadsheetId: props.getProperty(PROP_MASTER_DATA_SPREADSHEET_ID) || null,
    weatherDataSpreadsheetId: props.getProperty(PROP_WEATHER_DATA_SPREADSHEET_ID) || null,
    raceResultsUploadFolderId: props.getProperty(PROP_RACE_UPLOAD_FOLDER_ID) || null,
    geminiKey: props.getProperty(PROP_GEMINI_API_KEY) || null,
  };
}

var Config = {
  get() {
    const props = PropertiesService.getScriptProperties();
    return {
      masterDataSpreadsheetId: props.getProperty(PROP_MASTER_DATA_SPREADSHEET_ID),
      weatherDataSpreadsheetId: props.getProperty(PROP_WEATHER_DATA_SPREADSHEET_ID),
      raceResultsUploadFolderId: props.getProperty(PROP_RACE_UPLOAD_FOLDER_ID),
      geminiKey: props.getProperty(PROP_GEMINI_API_KEY),
      templateName: 'Race Result Template',
      workingSheetName: 'Current Regatta'
    };
  }
};
