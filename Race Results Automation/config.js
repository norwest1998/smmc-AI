/* config.gs
* Global configuration, property keys, and setter helpers.
*/


// Overall Results / Handicaps sheet layout:
// rows 1-2 spacer, rows 3-4 metadata, rows 5-6 spacer, row 7 headers, row 8+ data
const OVERALL_META_ROW_1 = 3;
const OVERALL_META_ROW_2 = 4;
const OVERALL_HEADER_ROW = 7;
const OVERALL_DATA_START_ROW = 8;

// Script property keys
const PROP_ROUND_TRACKER_WEBAPP = "ROUND_TRACKER_WEBAPP";
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

function getProp(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v;
}

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {
    raceUploadFolderId: props.getProperty(PROP_RESULTS_UPLOAD_FOLDER_ID) || null,
    roundTrackerWebAppURL: props.getProperty(PROP_ROUND_TRACKER_WEBAPP) || null,
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
