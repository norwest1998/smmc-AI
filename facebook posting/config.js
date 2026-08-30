/* config.gs
* Global configuration, property keys, and setter helpers.
*/

const PROP_FB_POSTING_ID = "PROP_FB_POSTING_ID";
const PROP_FACEBOOK_PAGE_ID = "FACEBOOK_PAGE_ID";
const PROP_FACEBOOK_PAGE_ACCESS_TOKEN = "FACEBOOK_PAGE_ACCESS_TOKEN";

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {

    fbPageId: props.getProperty(PROP_FACEBOOK_PAGE_ID) || null,
    fbToken: props.getProperty(PROP_FACEBOOK_PAGE_ACCESS_TOKEN) || null,
    fbPostingSheetID: props.getProperty(PROP_FB_POSTING_ID) || null
  };
}
