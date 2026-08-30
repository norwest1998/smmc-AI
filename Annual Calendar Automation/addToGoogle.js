function addToGoogleCalendar() {
  // var ui = SpreadsheetApp.getUi();
  //try {
    // Get the active spreadsheet and Upcoming Event Data sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var eventSheet = spreadsheet.getSheetByName('APP Upload Matrix');
    if (!eventSheet) {
      ui.alert('Error: "Event Data" sheet not found.');
      return;
    }
    
    // Get all data (assuming headers in row 1, data starts at row 2)
    var data = eventSheet.getDataRange().getValues();
    if (data.length < 2) {
      console.log('No events found in "Event Data" sheet.');
      return;
    }

    // Open the Club Management spreadsheet (replace with actual ID)    
    var cfg = getConfig();
    var clubSpreadsheetId = cfg.clubManagementID;
    var clubSpreadsheet = SpreadsheetApp.openById(clubSpreadsheetId);

    // ClassMembers: boatId | Active | MemberName | ClassName | SailNumber
    const allClassMembersRows = sheetToObjects(clubSpreadsheet,'ClassMembers',
      ['boatId','active','membername','classname',
       'sailnumber','model','handicap','HRN',	'gh'
      ]);

    // ✅ Keep only ACTIVE boats
    const classMembersRows = allClassMembersRows.filter(r => r.active && r.active.toString().trim().toLowerCase() === 'active');
    const classGHRows = allClassMembersRows.filter(
      r => r.active 
      && r.active.toString().trim().toLowerCase() === 'active'
      && r.gh === 'Y' );

    // array of membername, sailNumber by class
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
    // array for GH Members
    const ghClass = 'General';
    classGHRows.forEach(r => { 
      if (!classMembersMap[ghClass])      // if no array for this class yet
        classMembersMap[ghClass] = [];    // create it
      classMembersMap[ghClass].push({     // add member object into array
        membername: r.membername,
        sailnumber: r.sailnumber,
        boatId: r.boatId
      });
    });

    // Get all member data
    var memberSheet = clubSpreadsheet.getSheetByName('Members');
    if (!memberSheet) {
      console.log('Error: "Members" sheet not found in Club Management spreadsheet.');
      return;
    }
    var memberData = memberSheet.getDataRange().getValues();

    var cfg = getConfig();
    var calendarId = 'primary';
    var calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) {
      console.log('Error: Calendar not found. Check the ID.');
      return;
    }
    
    const todayDate = new Date();

    // Process each event row (starting from index 1 to skip headers)
    for (var i = 1; i < data.length; i++) {
      var eventName = data[i][23];  // Column X
      var eventDate = new Date(data[i][1]);  // Column B (date object)
      var eventClass = data[i][4]; // Column E
      var start = createDateObject(data[i][18]); // Column E
      var end = createDateObject(data[i][19]); // Column E
      var eventType = data[i][7]; // Column E

      // Skip invalid rows
      if (!eventName || !eventDate || !(eventDate instanceof Date) || !eventClass || !eventType) {
        continue;
      }

      if (eventDate >= todayDate) {

        // Find eligible members for this class (active boat)
        var eligibleEmails = [];
        var classMembers = classMembersMap[eventClass];
        if(classMembers.length > 0){
          for (var j = 0; j < classMembers.length; j++) {  
            var memberName =  classMembers[j].membername;
            for (var k = 1; k < memberData.length; k++) {  // Skip headers
              if (memberData[k][2] === memberName && memberData[k][1] === "Y"){
                eligibleEmails.push(memberData[k][8]);
              }
            }
          }
                
          // Create the event and add guests if any
          if (eligibleEmails.length > 0) {
            var event = calendar.createEvent(eventName, start, end, {
              guests: eligibleEmails.join(','),
              sendInvites: true
            });
            console.log('Created event: ' + eventName + ' with ' + eligibleEmails.length + ' guests.');
          } else {
            // Create event without guests if no eligible members
            var event = calendar.createEvent(eventName, start, end);
            console.log('Created event: ' + eventName + ' (no eligible guests).');
          }
        }
      }
    }
    
    console.log('Events added to calendar and invitations sent successfully!');
  //} catch (error) {
  //  console.log('Error: ' + error.message);
  //  console.log(error);
  //}
}