// Global variable for caching data across execution (in-memory for the same run)
let MASTER_DATA_CACHE = null;

function getMasterData() {
  if (MASTER_DATA_CACHE !== null) {
    return MASTER_DATA_CACHE;
  }

  const cache = CacheService.getScriptCache();
  const cachedData = cache.get('MASTER_DATA_FULL');

  if (cachedData) {
    try {
      MASTER_DATA_CACHE = JSON.parse(cachedData);
      console.log("Loaded Master Data from CacheService.");
      return MASTER_DATA_CACHE;
    } catch (e) {
      console.log("Cache parsing error: " + e.message);
    }
  }

  console.log("Cache miss. Loading Master Data from Google Sheets...");
  MASTER_DATA_CACHE = loadMasterData();

  try {
    // Cache the full object for 15 minutes (900 seconds)
    cache.put('MASTER_DATA_FULL', JSON.stringify(MASTER_DATA_CACHE), 900);
  } catch (e) {
    console.log("Cache size limit exceeded for full data, attempting to cache specific maps...");
    try {
      // Fallback if the 100kb CacheService limit is hit: 
      // just cache the essential requested maps
      const partialCache = {
        classMembersMap: MASTER_DATA_CACHE.classMembersMap,
        regattasByName: MASTER_DATA_CACHE.regattasByName
      };
      cache.put('MASTER_DATA_FULL', JSON.stringify(partialCache), 900);
    } catch (e2) {
      console.log("Failed to cache master data: " + e2.message);
    }
  }

  return MASTER_DATA_CACHE;
}

/**
* Loads master data from Club Management workbook
*/
function loadMasterData() {
  const cfg = getConfig();
  const id = cfg.masterDataSpreadsheetId;
  if (!id) throw new Error('MASTER DATA spreadsheet id not set (use setMasterConfig).');
  const ss = SpreadsheetApp.openById(id);

  // Members sheet: MemberID | Active | Name
  const members = sheetToObjects(ss, SHEET_MEMBERS, ['memberId', 'active', 'membername']);

  // Classes sheet: ClassID | ClassName
  const classes = sheetToObjects(ss, SHEET_CLASSES, ['classId', 'classname']);

  // ClassMembers: boatId | Active | MemberName | ClassName | SailNumber
  const allClassMembersRows = sheetToObjects(
    ss,
    SHEET_CLASSMEMBERS,
    ['boatId', 'active', 'membername', 'classname', 'sailnumber', 'model', 'handicap', 'hrn', 'gh', 'ghcap']
  );

  // FIX: Fixed the rogue comma in '<,7' mapping key to be '<7'
  const regattas = sheetToObjects(ss, SHEET_REGATTAS, ['regattaId', 'regattaname', 'classname', 'type', 'weekofmonth', 'time', 'hcap formula', '<4', '<7', '<13', '13+']);

  const classMembersRows = allClassMembersRows.filter(r => r.active);
  const ghMembersRows = allClassMembersRows.filter(r => r.gh);

  // --- 3. Build Lookup Maps ---
  const membersById = {};
  members.forEach(m => { if (m.memberId) membersById[m.memberId] = m; });

  const classesById = {};
  classes.forEach(c => { if (c.classId) classesById[c.classId] = c; });

  const classMembersMap = {}; 
  classMembersRows.forEach(r => {
    if (!classMembersMap[r.classname])
      classMembersMap[r.classname] = [];
      
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
      
    classMembersMap["General"].push({
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId,
      hcap: r.ghcap
    });
  });

  const regattasByName = {};
  regattas.forEach(r => regattasByName[(r.regattaname || '').toString().trim().toLowerCase()] = r);

  // --- 4. Return Comprehensive Data Structure ---
  return {
    members,
    membersById,
    classes,
    classesById,
    classMembersMap, 
    regattas,
    regattasByName
  };
}