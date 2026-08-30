
const PROP_Spreadsheet_ID = "Spreadsheet_ID";
const PROP_Sheet_ID = "Sheet_ID";
const PROP_Folder_ID = "Folder_ID";
const FolderName = "Scripts Backup"

let CONFIG_CACHE = null;

function getConfig() {
  if (CONFIG_CACHE === null) {
    // getProperties() fetches ALL key-value pairs in a single API call
    const props = PropertiesService.getScriptProperties().getProperties();
    
    CONFIG_CACHE = {
      spreadsheetId: props[PROP_Spreadsheet_ID] || null,
      sheetId: props[PROP_Sheet_ID] || null,
      folderId: props[PROP_Folder_ID] || null
    };
  }
  return CONFIG_CACHE;
}

let PROJECTDATA = null;

function getMasterData() {
  // Only execute spreadsheet reads if any cache variable is missing
  if (!PROJECTDATA) { 
    const cfg = getConfig();
    const ss = SpreadsheetApp.openById(cfg.spreadsheetId);

    if (PROJECTDATA === null) {
      const sheet = ss.getSheetById(cfg.sheetId);
      PROJECTDATA = sheet.getDataRange().getValues();
    }
  }

  // Return as an object so all 3 data sets are accessible cleanly
  return PROJECTDATA;
}