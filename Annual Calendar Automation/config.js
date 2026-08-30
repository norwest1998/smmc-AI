/* config.gs
* Global configuration, property keys, and setter helpers.
*/
const WEATHER_SS_ID = '1EYuf5wi4Gw-4WP1hdg9sZsOO9tbRx_Z-q5go8BBEOGc';
const DAILY_SHEET_NAME = 'WZ Daily Forecast';
const IMAGE_REGISTRY_SHEET = 'WZ Image Registry';

const DEFAULT_BG_IMAGE ='https://lh3.googleusercontent.com/d/1t7-6x1xF9ofD36oSfGY-avcnnwmpV19T=w1200';

const WEATHER_PIC_CACHE_HOURS = 12;

// Script property keys
const PROP_ClubManagementID = "ClubManagementID";
const PROP_CalendarID = "CalendarID";

// Keys used in the master data spreadsheet (sheet names)
const SHEET_MEMBERS = "Members"; // columns: MemberID, Name, Email, Telephone, WhatsApp
const SHEET_CLASSES = "Classes"; // columns: ClassID, ClassName, Description
const SHEET_CLASSMEMBERS = "ClassMembers"; // columns: ClassID, MemberID, Sail No
const SHEET_REGATTAS = "Regattas"; // columns: RegattaID, RegattaName, StartDate, EndDate

// Helper setters - run these once from the Apps Script editor to store secrets
function setMasterConfig(clubManagementID, calendarID) {
if (clubManagementID) PropertiesService.getScriptProperties().setProperty(PROP_MASTER_DATA_SPREADSHEET_ID, clubManagementID);
if (calendarID) PropertiesService.getScriptProperties().setProperty(PROP_RACE_UPLOAD_FOLDER_ID, calendarID);
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
    clubManagementID: props.getProperty(PROP_ClubManagementID) || null,
    calendarID: props.getProperty(PROP_CalendarID) || null,
  };
}

var Config = {
  get() {
    const props = PropertiesService.getScriptProperties();
    return {
      clubManagementID: props.getProperty(PROP_ClubManagementID),
      calendarID: props.getProperty(PROP_CalendarID)
    };
  }
};
