 /* config.gs
* Global configuration, property keys, and setter helpers.
*/
const PROP_RESULTS_PROCESSED_FOLDER_ID = "RESULTS_PROCESSED_FOLDER_ID"
const PROP_FACEBOOK_QUEUE_SHEET_ID = "FACEBOOK_QUEUE_SHEET_ID"
const PROP_FACEBOOK_PAGE_ID = "FACEBOOK_PAGE_ID"
const PROP_FACEBOOK_PAGE_ACCESS_TOKEN = "FACEBOOK_PAGE_ACCESS_TOKEN"

function getProp(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k); 
  return v;
}

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {
    facebookQueueSheetId: props.getProperty(PROP_FACEBOOK_QUEUE_SHEET_ID) || null,
    roundResultsFolderId: props.getProperty(PROP_RESULTS_PROCESSED_FOLDER_ID) || null,
    fbPageId: props.getProperty(PROP_FACEBOOK_PAGE_ID) || null,
    fbToken: props.getProperty(PROP_FACEBOOK_PAGE_ACCESS_TOKEN) || null
  };
}

/**
 * Sets a persistent property in the Script's property store.
 * used to store new Overall Results sheetIDs
 */
function setScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

