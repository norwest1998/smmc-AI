/* config.js
* Global configuration, property keys, and setter helpers.
*/

const PROP_FB_POSTING_ID = "PROP_FB_POSTING_ID";
const PROP_FACEBOOK_PAGE_ID = "FACEBOOK_PAGE_ID";
const PROP_FACEBOOK_PAGE_ACCESS_TOKEN = "FACEBOOK_PAGE_ACCESS_TOKEN";
const PROP_EVENT_BG_FOLDER_ID = "EVENT_BG_FOLDER_ID"; // Drive Folder containing background images
const PROP_WEATHER_API_URL = "WEATHER_API_URL";       // URL for club Weather WebApp / API
const PROP_CALENDAR_SHEET_ID = "PROP_CALENDAR_SHEET_ID"; // Calendar Sheet ID (if separate from Posting Sheet)

// Configurable Club Details & Link Placeholders
const CLUB_INFO = {
  name: "Sydney Maritime Modellers Club",
  venue: "SMMC Regatta Lake",
  website: "https://www.smmc.org.au",
  facebook: "https://facebook.com/SydneyMaritimeModellersClub",
  whatsApp: "https://chat.whatsapp.com/YOUR_INVITE_CODE_HERE",
  email: "info@smmc.org.au"
};

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    fbPageId: props.getProperty(PROP_FACEBOOK_PAGE_ID) || null,
    fbToken: props.getProperty(PROP_FACEBOOK_PAGE_ACCESS_TOKEN) || null,
    fbPostingSheetID: props.getProperty(PROP_FB_POSTING_ID) || null,
    calendarSheetId: props.getProperty(PROP_CALENDAR_SHEET_ID) || null,
    eventBgFolderId: props.getProperty(PROP_EVENT_BG_FOLDER_ID) || "",
    weatherApiUrl: props.getProperty(PROP_WEATHER_API_URL) || ""
  };
}