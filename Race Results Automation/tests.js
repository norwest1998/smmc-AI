const CONFIG = {
  SheetID: "18c2johld4J7gzkoSH63qp6qh7w--6t-1F_94vs4tBoc",
  SheetName: "Overall Results"
}

function test() {
  example(CONFIG.SheetID, CONFIG.SheetName);
}

function example(spreadsheetId,   sheetName) {
const ss = SpreadsheetApp.openById(spreadsheetId);
const sheet = ss.getSheetByName(sheetName);
console.log (sheet.getLastRow());
console.log (sheet.getLastColumn());
console.log (sheet.getSheetName());
console.log (sheet.getMaxRows());

}
