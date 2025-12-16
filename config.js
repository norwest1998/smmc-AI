/* config.gs
* Global configuration, property keys, and setter helpers.
*/

// Script property keys
const PROP_GEMINI_API_KEY = "GEMINI_API_KEY";
const PROP_FACEBOOK_PAGE_ID = "FACEBOOK_PAGE_ID";
const PROP_FACEBOOK_PAGE_ACCESS_TOKEN = "FACEBOOK_PAGE_ACCESS_TOKEN";
const PROP_RESULTS_UPLOAD_FOLDER_ID = "RESULTS_UPLOAD_FOLDER_ID";
const PROP_MASTER_DATA_SPREADSHEET_ID = "MASTER_DATA_SPREADSHEET_ID";
const PROP_RESULTS_PROCESSED_FOLDER_ID = "RESULTS_PROCESSED_FOLDER_ID";
const PROP_OVERALL_RESULTS_FOLDER = "OVERALL_RESULTS_FOLDER";

// Keys used in the master data spreadsheet (sheet names)
const SHEET_MEMBERS = "Members"; // columns: MemberID, Name, Email, Telephone, WhatsApp
const SHEET_CLASSES = "Classes"; // columns: ClassID, ClassName, Description
const SHEET_CLASSMEMBERS = "ClassMembers"; // columns: ClassID, MemberID, Sail No
const SHEET_REGATTAS = "Regattas"; // columns: RegattaID, RegattaName, StartDate, EndDate

// Helper setters - run these once from the Apps Script editor to store secrets
function setMasterConfig(masterSheetId, uploadFolderId, processedFolderId,overallResultsFolderId) {
  if (masterSheetId) PropertiesService.getScriptProperties().setProperty(PROP_MASTER_DATA_SPREADSHEET_ID, masterSheetId);
  if (uploadFolderId) PropertiesService.getScriptProperties().setProperty(PROP_RESULTS_UPLOAD_FOLDER_ID, uploadFolderId);
  if (processedFolderId) PropertiesService.getScriptProperties().setProperty(PROP_RESULTS_PROCESSED_FOLDER_ID, processedFolderId);
  if (overallResultsFolderId) PropertiesService.getScriptProperties().setProperty(PROP_OVERALL_RESULTS_FOLDER, overallResultsFolderId);
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
    raceProcessedFolderId: props.getProperty(PROP_RESULTS_PROCESSED_FOLDER_ID) || null,
    overallFolderId: props.getProperty(PROP_OVERALL_RESULTS_FOLDER) || null
  };
}

/**
 * Sets a persistent property in the Script's property store.
 * used to store new Overall Results sheetIDs
 */
function setScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}
