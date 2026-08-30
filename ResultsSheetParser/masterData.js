function loadMasterData() {
  const cfg = getConfig();
  const id = cfg.masterDataSpreadsheetId;

  if (!id) throw new Error('MASTER DATA spreadsheet id not set (use setMasterConfig).');
  const ss = SpreadsheetApp.openById(id);

  // Classes sheet: ClassID | ClassName
  const classes = sheetToObjects(ss, SHEET_CLASSES, ['classId','classname']);

  // ClassMembers: boatId | Active | MemberName | ClassName | SailNumber
  const allClassMembersRows = sheetToObjects(
    ss,
    SHEET_CLASSMEMBERS,
    ['boatId', 'active', 'membername', 'classname', 'sailnumber', 'model', 'handicap', 'hrn', 'gh']
  );

  // ✅ Keep only ACTIVE boats
  const classMembersRows = allClassMembersRows.filter(r =>
    r.active &&
    r.active.toString().trim().toLowerCase() === 'true'
  );

  const ghMembersRows = classMembersRows.filter(r =>
    r.gh &&
    r.gh.toString().trim().toLowerCase() === 'true'
  );

  // Regattas: RegattaID | RegattaName | ClassName
  const regattas = sheetToObjects(ss, SHEET_REGATTAS, ['regattaId','regattaname','classname']);

  // array of { membername, sailNumber }
  const classMembersMap = {};                // create empty object
  classMembersRows.forEach(r => {
    if (!classMembersMap[r.classname])      // if no array for this class yet
      classMembersMap[r.classname] = [];    // create it

    classMembersMap[r.classname].push({     // add member object into array"
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId
    });
    Logger.log("Class: " + r.classname + " ClassMember: " + r.membername + " Sail: " + r.sailnumber ) ;
  });

  ghMembersRows.forEach(r => {
    if (!classMembersMap["General"])
      classMembersMap["General"] = [];
   
    // Add the full member object (including boatId) into the array for the class
    classMembersMap["General"].push({
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId
    });
    Logger.log("Class: " + "General" + " ClassMember: " + r.membername + " Sail: " + r.sailnumber ) ;
  });

  const classesById = {};
  classes.forEach(c => { if (c.classId) classesById[c.classId] = c; });


  return {
  classes, classesById, classMembersMap, regattas
  };
}

/***** LEADERBOARD DATA LOADING *****/

function loadLeaderboard(regattaName){
  const folderName = "Overall Results Sheets";
  const sheetName = "Overall Results " + regattaName;

  const sheetId = findSheetInFolder(folderName,sheetName);
  if (!sheetId) {
    return{
    name: "None found",
    round: 0,
    data: []
  };
  }

  const overallSheet = SpreadsheetApp.openById(sheetId);
  const lb = overallSheet.getSheetByName("Overall results");
  const leaderboard = lb.getRange("C6:F").getValues();
  const roundNum = lb.getRange("D3").getValue() +1;
  const roundNumber = "Round No: " + roundNum;
    
  return {
    name: regattaName,
    round: roundNumber,
    data: leaderboard
  };
}

/***** EVENT DATA LOADING *****/

function loadEventData() {
  const props = PropertiesService.getScriptProperties();
  const calendarId = props.getProperty("ANNUAL_EVENTS_CALENDAR");
  const eventSheetIdStr = props.getProperty("EVENT_SHEET_ID");    // Event Data sheet

  if (!calendarId || !eventSheetIdStr) {
    throw new Error("Script Properties ANNUAL_EVENTS_CALENDAR or EVENT_SHEET_ID not set.");
  }

  const eventSheetId = Number(eventSheetIdStr);
  const calendarFile = SpreadsheetApp.openById(calendarId);
  const eventSheet = calendarFile.getSheetById(eventSheetId);

  if (!eventSheet) {
    throw new Error("Event Data sheet not found by ID: " + eventSheetIdStr);
  }

  const lastRow = eventSheet.getLastRow();
  const lastCol = eventSheet.getLastColumn();
  if (lastRow < 2) return [];

  const rows = eventSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return rows;
} 
