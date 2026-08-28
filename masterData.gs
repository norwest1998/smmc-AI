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
    membersById,
    classes,
    classesById,
    classMembersMap, // Grouped by class, includes boatId and is filtered for Active
    regattas,
    regattasByName
  };
}

function sheetToObjects(ss, sheetName, keys) {
  try {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    
    // Read all data in the sheet
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return []; // Only header row and empty data
    
    const results = [];
    // Start from row 2 (index 1) to skip header
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const obj = {};
      
      // Map column data to object keys
      for (let i = 0; i < keys.length; i++) {
        // Ensure we don't read past the actual data returned in this row
        const cellValue = (i < row.length) ? row[i] : null;
        
        // Handle empty strings safely
        obj[keys[i]] = (cellValue === '' || cellValue === undefined) ? null : cellValue;
      }
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error for ' + sheetName + ': ' + e);
    return [];
  }
}

