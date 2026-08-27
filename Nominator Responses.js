//======================================
// FILE: appsscript.html
//======================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}

//======================================
// FILE: onOpen.gs
//======================================

/**
 * Populates the choices of a Multiple Choice question named "Application"
 * in a Google Form from a Google Sheet.
 */
function updateDropdownFromSheet() {
  const formId = PropertiesService.getScriptProperties().getProperty('FormID');
  const sheetId = PropertiesService.getScriptProperties().getProperty('SheetID');

  if (!formId || !sheetId) {
    Logger.log('ERROR: FormID or SheetID property is missing.');
    return;
  }

  try {
    // 1. Get the data from the Spreadsheet
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName("Membership Applications"); 
    
    const data = sheet.getRange("B8:F").getValues(); 
    // 2. Filter and Map the choices
    const choices = data.filter(function(row) {
      // row[0] is column B (Status). Check for value, ignore "Processed", ignore header (if present)
      return row[0] && row[0] !== "Processed" && row[0] !== "Status";
    }).map(function(row) {
      // row[3] is column E (First Name), row[4] is column F (Last Name)
      return row[3] + " " + row[4]; 
    });
    
    Logger.log("Final Applicant Choices Array: " + JSON.stringify(choices));

    if (choices.length > 0) {
      // 3. Open the Form and Find the Item
      const form = FormApp.openById(formId);

      // Search for the Multiple Choice Item by title
      const targetItem = form.getItems()
                             .find(item => item.getTitle() === "Application" && item.getType() === FormApp.ItemType.MULTIPLE_CHOICE);
      
      if (targetItem) {
        // 4. Update the Multiple Choice Item
        const mcItem = targetItem.asMultipleChoiceItem();
        mcItem.setChoiceValues(choices);
        Logger.log('Successfully updated "Application" choices. Total choices: ' + choices.length);
      } else {
        Logger.log('ERROR: Multiple Choice item with title "Application" not found.');
      }
    } else {
      Logger.log('No valid applicants found to populate the form.');
    }
  } catch (e) {
    Logger.log('An error occurred: ' + e.toString());
  }
}

