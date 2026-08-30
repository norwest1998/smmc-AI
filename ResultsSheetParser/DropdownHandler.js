/***** HANDLERS *****/
/**
 * Populates the event dropdown in B4 based on date in B5 and regatta type in B6
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to operate on
 */
// Called when B4 changes (user selects from dropdown)
function handleDropdownSelection_(resultsSheet) {
  const selectedLabel = resultsSheet.getRange("B4").getValue();
  if (!selectedLabel) return;
  
  var regattaName = resultsSheet.getRange("B6").getValue();
  targetRegattaDate = selectedLabel.split(" - ")[0].trim();
  targetRegattaName = selectedLabel.split(" - ")[1].trim();

  var ui = SpreadsheetApp.getUi();

  if (!selectedLabel.includes(regattaName)) {
    var response = ui.alert(
      '⛔ Warning',
      `Regatta Date and Name will change to reflect the selected scheduled event.

  Date:         ${targetRegattaDate}
  Regatta Name: ${targetRegattaName}


  Do you want to continue?`,
      ui.ButtonSet.OK_CANCEL
    );

    if (response == ui.Button.CANCEL) {
      return; // stop script safely
    }

  }

  resultsSheet.getRange("B5").setValue(targetRegattaDate);
  resultsSheet.getRange("B6").setValue(targetRegattaName);

  // 1. Retrieve the stringified map from storage
  const scriptProperties = PropertiesService.getScriptProperties();
  const savedMapString = scriptProperties.getProperty(EVENT_MAP_PROPERTY_KEY);
  
  if (!savedMapString) {
    Logger.log("No event map found in storage.");
    return;
  }

  // 2. Parse it back into a JavaScript Object
  const map = JSON.parse(savedMapString);
  
  // 3. Get the specific data for the selected text
  const eventData = map[selectedLabel];
  const ss = resultsSheet.getParent();
  const currentRegattaSheet = ss.getSheetByName(CURRENT_REGATTA_SHEET_NAME);
  currentRegattaSheet.getRange(CURRENT_REGATTA_EVENT_ID_CELL).setValue(eventData.eventID);
  currentRegattaSheet.getRange("C5").setValue(Utilities.formatDate(new Date(eventData.startTime), Session.getScriptTimeZone(), "HH:mm"));
  currentRegattaSheet.getRange("D5").setValue(Utilities.formatDate(new Date(eventData.endTime), Session.getScriptTimeZone(), "HH:mm"));
  refreshConfigFromClubManagement()
}

function populateEventDropdown(sheet) {
  if (!sheet) {
    Logger.log("Error: No sheet provided to populateEventDropdown");
    return;
  }
  
  // Read user inputs from the provided sheet
  var searchDate = sheet.getRange("B5").getValue();  // Expected: Date object
  var regattaTypeRaw = sheet.getRange("B6").getValue();
  var regattaType = regattaTypeRaw ? regattaTypeRaw.toString().trim() : "";
 
  // Normalize search date to midnight

  var dropdownCell = "B4";

  // Get matching rows
  var results = findMatchingRows(searchDate, regattaType);

  if((results.exactMatches) && results.exactMatches.length === 1){
      sheet.getRange(CURRENT_REGATTA_EVENT_ID_CELL).setValue(results.exactMatches[0].hexKey);
      sheet.getRange("B5").setValue(results.exactMatches[0].date);
      sheet.getRange("C5").setValue(Utilities.formatDate(new Date(results.exactMatches[0].start), Session.getScriptTimeZone(), "HH:mm"));
      sheet.getRange("D5").setValue(Utilities.formatDate(new Date(results.exactMatches[0].end), Session.getScriptTimeZone(), "HH:mm"));
      sheet.getRange("B4").setValue(results.exactMatches[0].displayText);
      refreshConfigFromClubManagement()
      return;
  } 
  
  // Prioritize: exact → same regatta in range → any in range
  var prioritized = [
    ...results.exactMatches,
    ...results.sameRegattaInRange.filter(m => 
      !results.exactMatches.some(e => e.hexKey === m.hexKey)),
    ...results.anyInRange.filter(m => 
      !results.exactMatches.some(e => e.hexKey === m.hexKey) &&
      !results.sameRegattaInRange.some(s => s.hexKey === m.hexKey))
  ];
  
  var cell = sheet.getRange(dropdownCell);
  
  // No matches
  if (prioritized.length === 0) {
    cell.clearDataValidations().setValue("No matching events found");
    sheet.getRange("A1").clearContent();
    PropertiesService.getScriptProperties().deleteProperty(EVENT_MAP_PROPERTY_KEY);
    return;
  }
  
  // Build display texts and hex keys
  var displayTexts = prioritized.map(m => m.displayText);
  var hexKeys = prioritized.map(m => m.hexKey);
  var starts = prioritized.map(m => m.start);
  var ends = prioritized.map(m => m.end);
  
  // Create mapping: display text → hex key
  var map = {};
  displayTexts.forEach((text, i) => {
    map[text] = {
    eventID: hexKeys[i],
    startTime: Utilities.formatDate(new Date(starts[i]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    endTime: Utilities.formatDate(new Date(ends[i]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss")
    }
  });

  // Store in Script Properties
  PropertiesService.getScriptProperties().setProperty(EVENT_MAP_PROPERTY_KEY,JSON.stringify(map));
  
  // Apply dropdown
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(displayTexts, true)
    .setAllowInvalid(false)
    .setHelpText("Select an event")
    .build();
  
  cell.setDataValidation(rule);
  
  // Pre-select the best match
  cell.setValue(displayTexts[0]);

}

function findMatchingRows(searchDate, regattaType) {
  var eventRows = getEventData();  // Your existing function returning 2D array
  
  if (!searchDate) return { exactMatches: [], sameRegattaInRange: [], anyInRange: [] };
  
  var baseDate = new Date(searchDate);
  baseDate.setHours(0, 0, 0, 0);
  
  var targetRegatta = (regattaType || '').trim();
  var hasRegattaFilter = targetRegatta !== '';
  
  var rangeStart = new Date(baseDate.getTime());
  rangeStart.setDate(baseDate.getDate() - 14);

  var rangeEnd = new Date(baseDate.getTime());
  rangeEnd.setDate(baseDate.getDate() + 14);
  

  var exactMatches = [];
  var sameRegattaInRange = [];
  var anyInRange = [];

  
  for (var i = 0; i < eventRows.length; i++) {
    var row = eventRows[i];
    if (row.length < 8) continue;
    
    var dateRaw = row[2];

    var normalizedRowDate = new Date(dateRaw);
    normalizedRowDate.setHours(0, 0, 0, 0);
  
    var rowRegatta = ((row[6] || '') + ' ' + (row[7] || '')).trim();

    var inRange = normalizedRowDate >= rangeStart && normalizedRowDate <= rangeEnd;
    if (!inRange) continue;
    
    var match = {
      sheetRowNumber: i + 1,
      hexKey: row[0] || '',
      date: dateRaw,
      start: Utilities.formatDate(new Date(row[COL_START]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      end:  Utilities.formatDate(new Date(row[COL_FINISH]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      regatta: rowRegatta,
      fullRow: row,
      displayText: Utilities.formatDate(dateRaw, Session.getScriptTimeZone(), "yyyy-MM-dd") + 
             " - " + rowRegatta
    };

    anyInRange.push(match);
    if (hasRegattaFilter && rowRegatta === targetRegatta) {
      sameRegattaInRange.push(match);
      if (dateRaw.getTime() === searchDate.getTime()) {
        exactMatches.push(match);
      }
    }
  }
  
  return {
    exactMatches: exactMatches,
    sameRegattaInRange: sameRegattaInRange,
    anyInRange: anyInRange
  };
}

