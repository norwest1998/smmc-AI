// --- CONFIGURATION ---
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwvTsLbXwjZzJJj4BqKdG_QIea-iDnLVfPf0zx7doRZ2RwcIwmEzdm_C_Xxt7g6lo-J/exec";
const MembersSheetId = 0;
const MembersHeaders = ['No','Active','MemberName','Membership','Start Date','End Date','Paid up','Phone','email','WhatsApp','Duplicate','Address Line','Suburb','PCode',	'Emergency Contact Name','Emergency Contact Number','Calendar Subscription'];
const TrackingSheetId = 614102941;
const TrackingHeaders = ['Code','Timestamp','Member Name','Member email','Email status','Response Date','Reminder Date'];

// Keys used in the master data spreadsheet (sheet names)
const SHEET_MEMBERS = "Members"; // columns: MemberID, Name, Email, Telephone, WhatsApp
const SHEET_CLASSES = "Classes"; // columns: ClassID, ClassName, Description
const SHEET_CLASSMEMBERS = "ClassMembers"; // columns: ClassID, MemberID, Sail No
const SHEET_REGATTAS = "Regattas"; // columns: RegattaID, RegattaName, StartDate, EndDate

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HEREE";
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Members sheet: MemberID | Active | Name
  const members = sheetToObjects(ss, SHEET_MEMBERS, ['memberId', 'active', 'membername', 'Membershiptype', 'startdate', 'enddate', 'paidup', 'phone', 'email']);

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
    classMembersMap, // Grouped by class, includes boatId and is filtered for Active
  };
}

