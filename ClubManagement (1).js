//======================================
// FILE: appsscript.html
//======================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Calendar",
        "version": "v3",
        "serviceId": "calendar"
      }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}

//======================================
// FILE: sendUpdateRequests.gs
//======================================

// --- CONFIGURATION ---
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
// Make sure to replace this URL after deploying Step 4
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycby-H3M2-kuZtO9AGKKYx2ZwlUSoIRGwvFcheO9xMbcScNn3cYng7OiN4W4lxJw5dl6G/exec"; 

// --- 1. SEND EMAILS & TRACK ---
function sendUpdateRequests() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("Members");
  const trackingSheet = ss.getSheetByName("Tracking");
  
  const memberData = memberSheet.getDataRange().getValues();
  const headers = memberData[0];
  
  // Find column indexes
  const idxActive = headers.indexOf("Active");
  const idxName = headers.indexOf("MemberName");
  const idxEmail = headers.indexOf("email");
  
  const timestamp = new Date();
  
  // Loop through members (skip header)
  for (let i = 1; i < memberData.length; i++) {
    const row = memberData[i];
    
    // Only send to Active members with an email
    Logger.log(row[idxActive] + " MemberName: " + row[idxName]);
    if (row[idxActive] === true || row[idxActive] === "Yes" || row[idxActive] === "Active") {
      const memberName = row[idxName];
      const memberEmail = row[idxEmail];
      
      if (!memberEmail) continue;
      
      // Generate unique 8-character hex code
      const hexCode = generateHexCode();
      
      // Generate personalized link
      const personalLink = `${WEB_APP_URL}?id=${hexCode}`;
      
      // Send Email
      const subject = "SMMC Member Information - Please Update Your Details";
      const body = 
        "Dear " + memberName + ",\n\n" +
        "It's membership renewal time again, please pay the annual membership fees of $40 into the bank account:\n" +
        "   Bank: ANZ\n" + 
        "   BSB: 012-228\n" + 
        "   A/c No: 2236-53527\n\n" +
        "Please review and update your personal and boat details by clicking the link below:\n\n" +
        personalLink +
        "\n\nThank you,\nSMMC Management";
      
      try {
        MailApp.sendEmail(memberEmail, subject, body);
        
        // Log to Tracking sheet
        // Code, Timestamp, Member Name, Member email, Email status, Response Date, Reminder Date
        trackingSheet.appendRow([hexCode, timestamp, memberName, memberEmail, "Sent", "", timestamp]);
      } catch (e) {
        Logger.log(`Failed to send to ${memberEmail}: ${e.message}`);
      }
    }
  }
}

function generateHexCode() {
  return Math.floor((1 + Math.random()) * 0x10000000).toString(16).substring(1);
}

// --- 2. WEB APP ROUTING (GET & POST) ---
function doGet(e) {
  const hexCode = e.parameter.id;
  if (!hexCode) {
    return ContentService.createTextOutput("Invalid Link. No ID provided.");
  }
  
  // Find member email from tracking sheet using hex code
  const memberEmail = getEmailFromTrackingCode(hexCode);
  if (!memberEmail) {
    return ContentService.createTextOutput("Invalid or expired link.");
  }
  
  // Fetch member and boat records
  const data = getMemberAndBoatData(memberEmail);
  data.hexCode = hexCode; // Pass code to frontend
  
  // Load HTML template
  const template = HtmlService.createTemplateFromFile('Index');
  template.data = data;
  
  return template.evaluate()
      .setTitle("SMMC Details Update")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Helper to look up email by hex code
function getEmailFromTrackingCode(code) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Tracking");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == code) {
      return data[i][3]; // Column D: Member email
    }
  }
  return null;
}

// Fetch current details for form pre-population
function getMemberAndBoatData(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("Members");
  const classSheet = ss.getSheetByName("ClassMembers");
  
  const mData = memberSheet.getDataRange().getValues();
  const mHeaders = mData[0];
  let memberRow = null;
  
  for (let i = 1; i < mData.length; i++) {
    if (mData[i][mHeaders.indexOf("email")] === email) {
      memberRow = mData[i];
      break;
    }
  }
  
  const cData = classSheet.getDataRange().getValues();
  const cHeaders = cData[0];
  let boatRows = [];
  
  for (let j = 1; j < cData.length; j++) {
    if (cData[j][cHeaders.indexOf("Member")] === memberRow[mHeaders.indexOf("MemberName")]) {
      boatRows.push({ rowNum: j + 1, data: cData[j] });
    }
  }
  
  // Format Member Object mapping headers to values
  let memberObj = {};
  mHeaders.forEach((h, index) => {
    memberObj[h] = memberRow ? memberRow[index] : "";
  });
  
  // Format Boats Array
  let boatsArr = boatRows.map(b => {
    let obj = { _rowNum: b.rowNum };
    cHeaders.forEach((h, index) => {
      obj[h] = b.data[index];
    });
    return obj;
  });
  
  return { member: memberObj, boats: boatsArr };
}

// --- 3. PROCESS FORM SUBMISSION ---
function processForm(formData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = new Date();
  const hexCode = formData.hexCode;
  const memberEmail = getEmailFromTrackingCode(hexCode);
  
  if (!memberEmail) return "Error: Session Expired";
  
  // 1. Update Members Sheet & Audit Log
  const memberSheet = ss.getSheetByName("Members");
  const mData = memberSheet.getDataRange().getValues();
  const mHeaders = mData[0];
  let mRowIndex = -1;
  
  for (let i = 1; i < mData.length; i++) {
    if (mData[i][mHeaders.indexOf("email")] === memberEmail) {
      mRowIndex = i + 1;
      break;
    }
  }
  
  const memberFieldsToUpdate = ["MemberName", "Phone", "email", "Address Line", "Suburb", "PCode", "Emergency Contact Name", "Emergency Contact Number", "WhatsApp"];
  const auditLogSheet = ss.getSheetByName("AuditLog");
  const memberName = mData[mRowIndex-1][mHeaders.indexOf("MemberName")];
  
  if (mRowIndex !== -1) {
    memberFieldsToUpdate.forEach(field => {
      const colIdx = mHeaders.indexOf(field) + 1;
      const oldValue = memberSheet.getRange(mRowIndex, colIdx).getValue();
      const newValue = formData["m_" + field];
      
      if (String(oldValue) !== String(newValue)) {
        memberSheet.getRange(mRowIndex, colIdx).setValue(newValue);
        // Code, Timestamp, Name, Field, Old Value, New Value
        auditLogSheet.appendRow([hexCode, timestamp, memberName, `Member.${field}`, oldValue, newValue]);
      }
    });
  }
  
  // 2. Update ClassMembers Sheet & Audit Log
  const classSheet = ss.getSheetByName("ClassMembers");
  const cHeaders = classSheet.getDataRange().getValues()[0];
  const boatFieldsToUpdate = ["Class", "SailNo", "Model", "HRN", "GH", "Active"];
  
  // Destructure boats from form data parsing
  let index = 0;
  while (formData[`b_row_${index}`]) {
    const rNum = parseInt(formData[`b_row_${index}`]);
    boatFieldsToUpdate.forEach(field => {
      const colIdx = cHeaders.indexOf(field) + 1;
      const oldValue = classSheet.getRange(rNum, colIdx).getValue();
      let newValue = formData[`b_${field}_${index}`];
      
      // Handle checkboxes for Active status safely
      if (field === "Active") {
        newValue = (newValue === "true" || newValue === true || newValue === "on");
      }
      
      if (String(oldValue) !== String(newValue)) {
        classSheet.getRange(rNum, colIdx).setValue(newValue);
        auditLogSheet.appendRow([hexCode, timestamp, memberName, `Boat[Row:${rNum}].${field}`, oldValue, newValue]);
      }
    });
    index++;
  }
  
  // 3. Update Tracking Sheet
  const trackingSheet = ss.getSheetByName("Tracking");
  const tData = trackingSheet.getDataRange().getValues();
  for (let k = 1; k < tData.length; k++) {
    if (tData[k][0] == hexCode) {
      trackingSheet.getRange(k + 1, 5).setValue("Updated"); // Column E: Status
      trackingSheet.getRange(k + 1, 6).setValue(timestamp); // Column F: Response Date
      break;
    }
  }
  
  return "Success";
}


//======================================
// FILE: Index.html
//======================================

<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css">
  <style>
    body { 
      max-width: 900px; 
      margin: 20px auto; 
      padding: 20px;
    }
    
    /* Grid layout structure */
    .grid-2-col {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    
    /* Make broad elements span across both columns if needed */
    .full-width {
      grid-column: span 2;
    }
    
    /* Styling sections */
    .form-section {
      background: #f9f9f9;
      padding: 25px;
      margin-bottom: 30px;
      border-radius: 8px;
      border: 1px solid #e1e1e1;
    }
    
    .boat-card {
      background: #ffffff;
      border: 1px solid #ccc;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 6px;
    }
    
    .form-group {
      display: flex;
      flex-direction: column;
      margin-bottom: 10px;
    }
    
    .form-group label {
      margin-bottom: 5px;
      font-weight: bold;
    }
    
    .checkbox-group {
      flex-direction: row;
      align-items: center;
      gap: 10px;
      margin-top: 25px;
    }

    /* Text Inputs high-contrast light-grey background design */
    input[type="text"], input[type="email"], input[type="url"] { 
      color: #000000 !important; 
      background-color: #aae5f2 !important; /* Soft light-grey input fill */
      border: 1px solid #666666 !important; /* Defined boundary lines */
      padding: 10px; 
      font-weight: 500; 
      border-radius: 4px;
      width: 100%;                  /* Expanded to be full width */
      max-width: 400px;             /* Matches the exact size of Primary Contact box */
      box-sizing: border-box;       /* Prevents padding overflow */
      transition: background-color 0.2s, border-color 0.2s;

    .hidden { display: none; }
    .success-msg { color: green; font-weight: bold; text-align: center; padding: 40px; }

    h2, h3 { color: #0056b3 !important; margin-top: 0; font-weight: 700; }
    p, span, div { color: #000000 !important; }

  </style>
</head>
<body>

  <h2>SMMC Member Information</h2>
  <p>Please review your details below. Update any missing or incorrect information and click submit at the bottom when complete.</p>

  <form id="updateForm">
    <input type="hidden" name="hexCode" value="<?= data.hexCode ?>">

    <div class="form-section">
      <h3>Personal Profile</h3>
      <div class="grid-2-col">
        
        <div class="form-group">
          <label>Member Name</label>
          <input type="text" name="m_MemberName" value="<?= data.member['MemberName'] ?>">
        </div>

        <div class="form-group">
          <label>Phone</label>
          <input type="text" name="m_Phone" value="<?= data.member['Phone'] ?>">
        </div>

        <div class="form-group">
          <label>Email</label>
          <input type="email" name="m_email" value="<?= data.member['email'] ?>">
        </div>

        <div class="form-group">
          <label>Address Line</label>
          <input type="text" name="m_Address Line" value="<?= data.member['Address Line'] ?>">
        </div>

        <div class="form-group">
          <label>Suburb</label>
          <input type="text" name="m_Suburb" value="<?= data.member['Suburb'] ?>">
        </div>

        <div class="form-group">
          <label>Post Code</label>
          <input type="text" name="m_PCode" value="<?= data.member['PCode'] ?>">
        </div>

        <div class="form-group">
          <label>Emergency Contact Name</label>
          <input type="text" name="m_Emergency Contact Name" value="<?= data.member['Emergency Contact Name'] ?>">
        </div>

        <div class="form-group">
          <label>Emergency Contact Number</label>
          <input type="text" name="m_Emergency Contact Number" value="<?= data.member['Emergency Contact Number'] ?>">
        </div>
        
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" name="m_WhatsApp" value="true" <? if(data.member['WhatsApp'] == true || data.member['WhatsApp'] == "Yes" || data.member['WhatsApp'] == "true") { ?>checked<? } ?>> Have you joined the WhatsApp community?
          </label>
        </div>
      </div>
    </div>

    <div class="form-section">
      <h3>Registered Boats</h3>
      <div id="boatsContainer">
        <? if (data.boats.length === 0) { ?>
          <p>No boats registered under your profile.</p>
        <? } else { ?>
          <? for (let i = 0; i < data.boats.length; i++) { ?>
            <div class="boat-card">
              <h4 class="full-width" style="margin-top:0;">Boat #<?= i+1 ?> (ID: <?= data.boats[i]['BoatID'] ?>)</h4>
              <input type="hidden" name="b_row_<?= i ?>" value="<?= data.boats[i]._rowNum ?>">
              
              <div class="grid-2-col">
                <div class="form-group">
                  <label>Class</label>
                  <input type="text" name="b_Class_<?= i ?>" value="<?= data.boats[i]['Class'] ?>">
                </div>

                <div class="form-group">
                  <label>Sail No</label>
                  <input type="text" name="b_SailNo_<?= i ?>" value="<?= data.boats[i]['SailNo'] ?>">
                </div>

                <div class="form-group">
                  <label>Model</label>
                  <input type="text" name="b_Model_<?= i ?>" value="<?= data.boats[i]['Model'] ?>">
                </div>

                <div class="form-group">
                  <label>Hull Registration Number</label>
                  <input type="text" name="b_HRN_<?= i ?>" value="<?= data.boats[i]['HRN'] ?>">
                </div>

                <div class="form-group checkbox-group">
                  <label>
                  <input type="checkbox" name="b_GH_<?= i ?>" value="true" <? if(data.boats[i]['Active'] == true || data.boats[i]['Active'] == "Y" || data.boats[i]['Active'] == "true") { ?>checked<? } ?>> Used in GH?
                  </label>
                </div>

                <div class="form-group checkbox-group">
                  <label>
                    <input type="checkbox" name="b_Active_<?= i ?>" value="true" <? if(data.boats[i]['Active'] == true || data.boats[i]['Active'] == "Yes" || data.boats[i]['Active'] == "true") { ?>checked<? } ?>> Active Boat
                  </label>
                </div>
              </div>

            </div>
          <? } ?>
        <? } ?>
      </div>
    </div>

    <button type="button" id="submitBtn" style="width: 100%; margin-top: 10px;" onclick="submitForm()">Save & Update Details</button>
  </form>

  <div id="statusMessage" class="hidden"></div>

  <script>
    function submitForm() {
      const form = document.getElementById('updateForm');
      const btn = document.getElementById('submitBtn');
      const statusDiv = document.getElementById('statusMessage');
      
      btn.disabled = true;
      btn.innerText = "Saving your changes...";
      
      google.script.run
        .withSuccessHandler(function(response) {
          if (response === "Success") {
            form.classList.add('hidden');
            statusDiv.className = "success-msg";
            statusDiv.innerHTML = "<h3>Thank you!</h3><p>Your details have been successfully updated in the club records.</p>";
          } else {
            alert("Error running update: " + response);
            btn.disabled = false;
            btn.innerText = "Save & Update Details";
          }
        })
        .withFailureHandler(function(err) {
          alert("A server error occurred: " + err);
          btn.disabled = false;
          btn.innerText = "Save & Update Details";
        })
        .processForm(form);
    }
  </script>
</body>
</html>

//======================================
// FILE: sendCalendarInvites.gs.gs
//======================================

function sendClassInviteEmails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Open the external calendar sheet to get upcoming event classes if needed
  // (Assuming you have access to "SMMC Annual Calendar")
  
  var memberSheet = ss.getSheetByName("Members");
  var boatSheet = ss.getSheetByName("ClassMembers");
  
  var memberData = memberSheet.getDataRange().getValues();
  var boatData = boatSheet.getDataRange().getValues();
  
  // Helper maps to hold headers
  var mHeaders = memberData[0];
  var bHeaders = boatData[0];
  
  // Loop through members (skip header)
  for (var i = 1; i < memberData.length; i++) {
    var memberRow = memberData[i];
    var isMemberActive = memberRow[mHeaders.indexOf("Active")];
    var isSubscribed = memberRow[mHeaders.indexOf("Calendar Subscription")];
    var memberName = memberRow[mHeaders.indexOf("MemberName")];
    var memberEmail = memberRow[mHeaders.indexOf("email")];
    
    if (!isMemberActive || !memberEmail || !isSubscribed) continue;
    
    var eligibleClasses = new Set();
    var registeredBoats = [];
    
    // Find active boats for this member
    for (var j = 1; j < boatData.length; j++) {
      var boatRow = boatData[j];
      var isBoatActive = boatRow[bHeaders.indexOf("Active")];
      var boatOwner = boatRow[bHeaders.indexOf("Member")];
      var boatClass = boatRow[bHeaders.indexOf("Class")];
      var sailNo = boatRow[bHeaders.indexOf("SailNo")];
      var isGH = boatRow[bHeaders.indexOf("GH")];
      
      if (isBoatActive && boatOwner === memberName) {
        registeredBoats.push(boatClass + " (Sail #" + sailNo + ")");
        
        // Apply class mapping logic
        if (boatClass === "Marblehead" || boatClass === "General") {
          eligibleClasses.add("General Handicap");
        } else if (["DF65", "DF95", "IOM", "Soling"].includes(boatClass)) {
          eligibleClasses.add(boatClass);
        }
        
        // If GH field is true, they also get General Handicap
        if (isGH === true || String(isGH).toUpperCase() === "TRUE") {
          eligibleClasses.add("General Handicap");
        }
      }
    }
    
    // Only send email if they have active boats registered
    if (eligibleClasses.size > 0) {
      var classListStr = Array.from(eligibleClasses).join(", ");
      var boatListStr = registeredBoats.join(", ");
      
      var subject = "Action Required: Tailor Your SMMC Event Calendar Invites";
      
      // Constructing a mailto link to format their response cleanly for Phase 2
      var emailBody = "Dear " + memberName + ",\n\n" +
        "We are excited for the upcoming sailing season! To help you stay up to date, we are offering personalized calendar invites.\n\n" +
        "Our records show you have the following active boat(s): " + boatListStr + "\n" +
        "Based on this, you are eligible for invites to these classes: " + classListStr + "\n\n" +
        "To accept, please reply to this email keeping the text below intact and simply delete the classes you DO NOT want:\n\n" +
        "ACCEPTED_CLASSES: " + classListStr + "\n\n" +
        "Best regards,\nSMMC Club Management";
        
      GmailApp.sendEmail(memberEmail, subject, emailBody);
      Logger.log("Email : " + memberEmail + " Classes: " + classListStr);
    }
  }
}

//======================================
// FILE: helpers.gs
//======================================

function buildMenu() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Scripts')
    .addItem('Annual Update and Fees', 'sendUpdateRequests')
    .addSeparator()
    .addItem('Calendar Invites', 'sendCalendarInvites')
    .addToUi();
}


//======================================
// FILE: syncCalendars.gs
//======================================

function syncMembersDirectlyToCalendarSeries() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Get Members and Boats Data
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

  Logger.log("now: " + now + " Future: " + futureWindow);

  // 3. Loop through members to find checked boxes
  for (var i = 1; i < memberData.length; i++) {
    var memberRow = memberData[i];
    var isMemberActive = memberRow[mHeaders.indexOf("Active")];
    var memberName = memberRow[mHeaders.indexOf("MemberName")];
    var memberEmail = memberRow[mHeaders.indexOf("email")];
    var isSubscribed = memberRow[mHeaders.indexOf("Calendar Subscription")];
    
    // Process only active members who have the box checked (TRUE)
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
    
    // Track series IDs we've already handled for this specific member
    var processedSeriesIds = new Set();

    // 5. Look through the calendar events directly
    for (var k = 0; k < existingCalendarEvents.length; k++) {
      var calEvent = existingCalendarEvents[k];
      
      if (!calEvent.isRecurringEvent()) continue;
      
      var eventTitle = calEvent.getTitle();
      var eventSeries = calEvent.getEventSeries();
      
      var seriesId = eventSeries.getId().split('@')[0];
      Logger.log("EventTitle: " + eventTitle + " eventSeries: " + eventSeries + " seriesID: " + seriesId);
      
      if (processedSeriesIds.has(seriesId)) continue;

      // 6. Check if the calendar event title matches any of the member's classes
      var matchesMemberClass = false;

      for (var className of memberClasses) {
        Logger.log("EventTitle: " + eventTitle + " className: " + className);
        if (eventTitle.toLowerCase().includes(className.toLowerCase())) {
          matchesMemberClass = true;
          Logger.log(true);
          break; // Exits the loop immediately!
        }
      }
      
      if (matchesMemberClass) {
        processedSeriesIds.add(seriesId);
        
        // Always enforce a 1-second delay between evaluating series items to prevent rate limits
        Utilities.sleep(1000); 
        
        // 7. Use Advanced Patch Logic
        try {
          // Fetch the master event data object using Advanced API
          var apiEvent = Calendar.Events.get(calendarId, seriesId);
          
          if (!apiEvent.attendees) {
            apiEvent.attendees = [];
          }
          
          // Check if they are already on the list
          var alreadyAdded = apiEvent.attendees.some(function(attendee) {
            return attendee.email && attendee.email.toLowerCase() === memberEmail.toLowerCase();
          });
          
          if (!alreadyAdded) {
            // Un-comment these lines once your tests run cleanly with no errors!
            // apiEvent.attendees.push({ email: memberEmail }); 
            
            var optionalArgs = {
              sendUpdates: 'all'
            };
            
            // Execute patch
            // Calendar.Events.patch(apiEvent, calendarId, seriesId, optionalArgs); 
            Logger.log("Advanced Patch simulation successful: Ready to invite " + memberEmail + " to series " + eventTitle);
          } else {
            Logger.log(memberEmail + " is already a guest in series: " + eventTitle);
          }
          
        } catch(err) {
          Logger.log("Advanced API Error for " + memberEmail + " on series " + eventTitle + "ID: " + calendarId + " " + seriesId  + " erorr: " + err.message);
        }
      }
    }
  }
}

//======================================
// FILE: updateMemberships.gs
//======================================

/**
 * Function 1: renewMemberships
 * Scans the Members sheet and sets members to "Expired" and "Paid up" to FALSE
 * if current date > renewByDate + gracePeriod AND End Date < current date.
 */
function renewMemberships() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("Members");
  
  // 1. Fetch Variables from Named Ranges
  const renewByDate = new Date(ss.getRangeByName("renewByDate").getValue());
  const gracePeriodDays = Number(ss.getRangeByName("gracePeriod").getValue());
  
  // Calculate cutoff date = renewByDate + gracePeriod
  const cutoffDate = new Date(renewByDate);
  cutoffDate.setDate(cutoffDate.getDate() + gracePeriodDays);
  
  const runtimeDate = new Date(); // Current Date
  
  // Check if runtime date is beyond cutoff date
  if (runtimeDate <= cutoffDate) {
    Logger.log("Runtime date has not exceeded renewByDate + gracePeriod. No updates made.");
    return;
  }
  
  // 2. Read Members Data
  const lastRow = membersSheet.getLastRow();
  if (lastRow < 2) return; // No data rows
  
  const range = membersSheet.getRange(2, 1, lastRow - 1, 7);
  const values = range.getValues();
  
  // 3. Process Rows
  let updated = false;
  for (let i = 0; i < values.length; i++) {
    const endDateVal = values[i][5]; // Column F: End Date
    
    if (endDateVal instanceof Date && !isNaN(endDateVal)) {
      const endDate = new Date(endDateVal);
      
      // Condition: End Date < runtime date
      if (endDate < runtimeDate) {
        values[i][1] = "Expired"; // Column B: Status
        values[i][6] = false;     // Column G: Paid up
        updated = true;
      }
    }
  }
  
  // 4. Write Updated Data back to Sheet
  if (updated) {
    range.setValues(values);
    SpreadsheetApp.getActiveSpreadsheet().toast("Membership statuses updated successfully.", "Success");
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast("No expired memberships found.", "Info");
  }
}

/**
 * Function 2: Automated Payment Processing via Checkbox
 * Triggered automatically when the 'Paid' checkbox is checked in 'Payment Processing' sheet.
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  
  // Target: "Payment Processing" sheet, Cell B5 (Row 5, Column 2)
  if (sheet.getName() === "Payment Processing" && range.getRow() === 5 && range.getColumn() === 2) {
    const isPaidChecked = range.getValue();
    
    // Process only when checked (TRUE)
    if (isPaidChecked === true) {
      const ss = e.source;
      const selectedMemberName = sheet.getRange("B2").getValue(); // Member selected in B2
      
      if (!selectedMemberName) {
        SpreadsheetApp.getUi().alert("Please select a member first.");
        range.setValue(false); // Reset checkbox
        return;
      }
      
      // Retrieve financialYearEnd from Named Range
      const financialYearEnd = ss.getRangeByName("financialYearEnd").getValue();
      
      const membersSheet = ss.getSheetByName("Members");
      const lastRow = membersSheet.getLastRow();
      const membersData = membersSheet.getRange(2, 1, lastRow - 1, 7).getValues();
      
      let memberFound = false;
      
      for (let i = 0; i < membersData.length; i++) {
        // Compare Member Name (Column C -> index 2)
        if (membersData[i][2] === selectedMemberName) {
          const rowToUpdate = i + 2; // Accounting for header offset
          
          membersSheet.getRange(rowToUpdate, 2).setValue("Active");           // Column B: Status
          membersSheet.getRange(rowToUpdate, 6).setValue(financialYearEnd); // Column F: End Date
          membersSheet.getRange(rowToUpdate, 7).setValue(true);             // Column G: Paid Up
          
          memberFound = true;
          break;
        }
      }
      
      // Reset the checkbox back to unchecked
      range.setValue(false);
      
      if (memberFound) {
        ss.toast(`Updated ${selectedMemberName}'s membership to Active.`, "Payment Recorded");
      } else {
        SpreadsheetApp.getUi().alert(`Member "${selectedMemberName}" was not found in the Members list.`);
      }
    }
  }
}


