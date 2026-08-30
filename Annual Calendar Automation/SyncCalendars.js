function syncMembersDirectlyToCalendarSeries() {
 
  // 1. Get Members and Boats Data
  var clubSpreadsheetId = "1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI";
  var ss = SpreadsheetApp.openById(clubSpreadsheetId);
  var memberSheet = ss.getSheetByName("Members");
  var boatSheet = ss.getSheetByName("ClassMembers");
  var memberData = memberSheet.getDataRange().getValues();
  var boatData = boatSheet.getDataRange().getValues();
  
  var mHeaders = memberData[0];
  var bHeaders = boatData[0];
  
  // 2. Connect to your Google Calendar
  var calendarId = "primary"; 
  var calendar = CalendarApp.getCalendarById(calendarId);
  
  // Fetch calendar events for the next 120 days to locate active series
  var now = new Date();
  var futureWindow = new Date(now.getTime() + (120 * 24 * 60 * 60 * 1000));
  var existingCalendarEvents = calendar.getEvents(now, futureWindow);

  // 3. Loop through members to find checked boxes in Column Q
  for (var i = 1; i < memberData.length; i++) {
    var memberRow = memberData[i];
    var isMemberActive = memberRow[mHeaders.indexOf("Active")];
    var memberName = memberRow[mHeaders.indexOf("MemberName")];
    var memberEmail = memberRow[mHeaders.indexOf("email")];
    var isSubscribed = memberRow[mHeaders.indexOf("Calendar Subscription")];
    
    // Process only active members who have Column Q checked (TRUE)
    if (!isMemberActive || !memberEmail || isSubscribed !== true) continue;
    
    Logger.log("Processing subscriptions for: " + memberName);
    
    // 4. Determine this member's eligible classes based on their active boats
    var memberClasses = new Set();
    for (var j = 1; j < boatData.length; j++) {
      var boatRow = boatData[j];
      var isBoatActive = boatRow[bHeaders.indexOf("Active")];
      var boatOwner = boatRow[bHeaders.indexOf("Member")];
      var boatClass = boatRow[bHeaders.indexOf("Class")];
      var isGH = boatRow[bHeaders.indexOf("GH")];
      
      if (isBoatActive && boatOwner === memberName) {
        if (boatClass === "Marblehead" || boatClass === "General") {
          memberClasses.add("General Handicap");
        } else if (["DF65", "DF95", "IOM", "Soling"].includes(boatClass)) {
          memberClasses.add(boatClass);
        }
        
        if (isGH === true || String(isGH).toUpperCase() === "TRUE") {
          memberClasses.add("General Handicap");
        }
      }
    }
    
    if (memberClasses.size === 0) continue;
    
    // Track series IDs we've already handled for this specific member to avoid duplicate work
    var processedSeriesIds = new Set();

    // 5. Look through the calendar events directly
    for (var k = 0; k < existingCalendarEvents.length; k++) {
      var calEvent = existingCalendarEvents[k];
      
      // We only care if it's a recurring series
      if (!calEvent.isRecurringEvent()) continue;
      
      var eventTitle = calEvent.getTitle();
      var eventSeries = calEvent.getEventSeries();
      var seriesId = eventSeries.getId();
      
      if (processedSeriesIds.has(seriesId)) continue;

      // 6. Check if the calendar event title matches any of the member's classes
      // Assumes your titles follow a pattern like "SMMC: DF65 Series" or contain the class name.
      var matchesMemberClass = false;
      memberClasses.forEach(function(className) {
        if (eventTitle.toLowerCase().includes(className.toLowerCase())) {
          matchesMemberClass = true;
        }
      });
      
      if (matchesMemberClass) {
        processedSeriesIds.add(seriesId);
        
        // Verify if they are already a guest on this series container
        var guests = eventSeries.getGuestList();
        var alreadyAdded = guests.some(function(g) {
          return g.getEmail().toLowerCase() === memberEmail.toLowerCase();
        });
        
        if (!alreadyAdded) {
          try {
            eventSeries.addGuest(memberEmail);
            Logger.log("Directly added " + memberEmail + " to series: " + eventTitle);
            Utilities.sleep(1000); // Prevents hitting Google ceilings
          } catch(err) {
            Logger.log("Error adding " + memberEmail + " to series " + eventTitle + ": " + err.message);
          }
        }
      }
    }
  }
}