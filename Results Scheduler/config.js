const WebAppUrl   = "https://script.google.com/macros/s/AKfycby3CuvtAkPvsrTwNMAwcG_BAQeLvb4XYyDCkguVGpoDTCv2OqILWBBfIUtNMUbFmhnuLA/exec";

// Script property keys
const PROP_RESULTS_UPLOAD_FOLDER_ID = "RESULTS_UPLOAD_FOLDER_ID";
const PROP_RESULTS_PROCESSED_FOLDER_ID = "RESULTS_PROCESSED_FOLDER_ID";
const PROP_CALENDAR_SPREADSHEET_ID = "CALENDAR_SPREADSHEET_ID"; // e.g., for 2025 calendar

let CONFIG = null;

if (!CONFIG) {
  CONFIG = getConfig()
}


function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {
    raceUploadFolderId: props.getProperty(PROP_RESULTS_UPLOAD_FOLDER_ID) || null,
    resultsProcessedFolderId: props.getProperty(PROP_RESULTS_PROCESSED_FOLDER_ID) || null,
    calendarSpreadsheetId: props.getProperty(PROP_CALENDAR_SPREADSHEET_ID) || null
  };
}
