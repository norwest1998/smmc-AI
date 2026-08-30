var ValidationController = {
  validateAllOrThrow() {
    const sheet = SpreadsheetApp.getActive()
      .getSheetByName(Config.get().workingSheetName);

    const hexkey = sheet.getRange(1,1).getValue();

    if (!hexkey) {
      SpreadsheetApp.getUi().alert("⛔ Warning: must select a scheduled event to link these scores to before submitting.");
      return;
    }
    var regattaName = sheet.getRange("B6").getValue();
    if(!(regattaName)) {
        SpreadsheetApp.getUi().alert("⛔ Warning: Regatta Name must be selected.");
        return;
    }

    var boatCount = sheet.getRange("B8").getValue();
    if(boatCount === 0) {
        SpreadsheetApp.getUi().alert("⛔ Warning: No race results entered.");
        return;
    }

    const flags = sheet.getRange('A62:Q68').getValues().flat();
    if (flags.includes(false)) {
      SpreadsheetApp.getUi().alert("⛔ Warning: Validation failed: one or more errors are pressent.");
      return;
    }
  
  const result = "OK";
  return result;
  }
}
