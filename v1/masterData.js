/**
* Loads master data from Club Management workbook
*/

// Global variable for caching data across execution
let MASTER_DATA_CACHE = null;

/**
 * Public function to retrieve master data, utilizing the cache for performance.
 * @returns {object} The cached master data object.
 */
function getMasterData() {
  if (MASTER_DATA_CACHE === null) {
    MASTER_DATA_CACHE = loadMasterData();
  }
  return MASTER_DATA_CACHE;
}

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
    ['boatId', 'active', 'membername', 'classname', 'sailnumber']
  );

  // Regattas: RegattaID | RegattaName | ClassName
  const regattas = sheetToObjects(ss, SHEET_REGATTAS, ['regattaId', 'regattaname', 'classname']);

  // --- 2. Filter Active Boats (Crucial step from original logic) ---
  const classMembersRows = allClassMembersRows.filter(r =>
    r.active &&
    r.active.toString().trim().toLowerCase() === 'active'
  );

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
      boatId: r.boatId
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
        // Ensure data exists and handle undefined/null values
        obj[keys[i]] = row[i] !== undefined ? (row[i] === '' ? null : row[i]) : null;
      }
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error for ' + sheetName + ': ' + e);
    return [];
  }
}