/**
 * SHIM — DO NOT ADD LOGIC HERE
 * All logic lives in the ResultsSheetParser library 
 */

function installableonOpen(e) {
  if (!isTemplate_()) return;
  ResultsSheetParser.onTemplateOpen(e);
}

function installableOnEdit(e) {
  Logger.log("in edit");
  if (!isTemplate_()) return;
  ResultsSheetParser.onTemplateEdit(e);
}

function installableOnSubmit(e) {
  if (!isTemplate_()) return;
  ResultsSheetParser.onTemplateSubmit(e);
}

/**
 * Template guard
 * Fires ONLY while file name == "Race Result Template"
 */
function isTemplate_() {
  return SpreadsheetApp.getActiveSpreadsheet().getName() === 'Race Result Template';
}

function runGenRaceReport() {
  //try {
    ResultsSheetParser.genRaceReport();
  //} catch (e) {
  //  SpreadsheetApp.getUi().alert("Error running report: " + e.message);
  //}
}
