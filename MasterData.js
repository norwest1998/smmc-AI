/* masterData.gs
* Load and query master data: Members, Classes, ClassMembers (with Sail Number), Regattas.
* Updated for new layout where Sail Number is in ClassMembers sheet.
*/


function loadMasterData() {
  const cfg = getConfig();
  const id = cfg.masterDataSpreadsheetId;
  if (!id) throw new Error('MASTER DATA spreadsheet id not set (use setMasterConfig).');
  const ss = SpreadsheetApp.openById(id);

  // Members sheet: MemberID | Active | Name 
  const members = sheetToObjects(ss, SHEET_MEMBERS, ['memberId','active','membername']);

  // Classes sheet: ClassID | ClassName
  const classes = sheetToObjects(ss, SHEET_CLASSES, ['classId','classname']);

  // ClassMembers: boatId | Active | MemberName | ClassName | SailNumber
  const allClassMembersRows = sheetToObjects(
    ss,
    SHEET_CLASSMEMBERS,
    ['boatId','active','membername','classname','sailnumber']
  );

  // ✅ Keep only ACTIVE boats
  const classMembersRows = allClassMembersRows.filter(r =>
    r.active &&
    r.active.toString().trim().toLowerCase() === 'active'
  );

  // Regattas: RegattaID | RegattaName | ClassName
  const regattas = sheetToObjects(ss, SHEET_REGATTAS, ['regattaId','regattaname','classname']);

  // Build lookup maps
  const membersById = {};
  members.forEach(m => { if (m.memberId) membersById[m.memberId] = m; });

  const classesById = {};
  classes.forEach(c => { if (c.classId) classesById[c.classId] = c; });

  // array of { membername, sailNumber }
  const classMembersMap = {};                // create empty object
  classMembersRows.forEach(r => {
    if (!classMembersMap[r.classname])      // if no array for this class yet
      classMembersMap[r.classname] = [];    // create it
    classMembersMap[r.classname].push({     // add member object into array
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId
    });
  });

  const regattasByName = {};
  regattas.forEach(r => regattasByName[(r.regattaName||'').toString().trim().toLowerCase()] = r);

  return {
  members, membersById, classes, classesById, classMembersMap, regattas, regattasByName
  };
}


function sheetToObjects(ss, sheetName, keys) {
  try {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    const results = [];
    for (let r=1;r<data.length;r++) {
      const row = data[r];
      const obj = {};
      for (let i=0;i<keys.length;i++) obj[keys[i]] = row[i] !== undefined ? (row[i]===''? null: row[i]) : null;
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error: ' + e);
    return [];
  }
}


function findMemberByClassAndSail(className, sail) {
  if (!className || !sail) return null;

  const md = loadMasterData();
  const classKey = className.toString().trim();

  const boats = md.classMembersMap[classKey];
  if (!boats || boats.length === 0) return null;

  const sailStr = sail.toString().trim();

  return boats.find(b =>
    b.sailnumber &&
    b.sailnumber.toString().trim() === sailStr
  ) || null;
}


function findRegattaByName(name) {
  if (!name) return null;
  const md = loadMasterData();
  return md.regattasByName[name.toString().trim().toLowerCase()] || null;
}