 function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row = range.getRow();
  const col = range.getColumn();
  
  // 1. CONFIGURATION - Match these exactly to your header text
  const COL_NAMES = ["Date", "Class", "Regatta Type", "HexKey", "Competition"];
  const headerRow = 1;

  // 2. DYNAMIC COLUMN MAPPING
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIdx = {};
  COL_NAMES.forEach(name => colIdx[name] = headers.indexOf(name) + 1);

  // Exit if headers are missing
  if (!colIdx["HexKey"] || row <= headerRow) return;

  const currentHex = sheet.getRange(row, colIdx["HexKey"]).getValue();
  const competition = sheet.getRange(row, colIdx["Competition"]).getValue();

  // --- FEATURE A: PREVENT MANIPULATION OF LOCKED ROWS ---
  // If a HexKey exists, prevent editing Date, Class, or Regatta Type
  const protectedCols = [colIdx["Date"], colIdx["Class"], colIdx["Regatta Type"], colIdx["HexKey"]];
  
if (currentHex !== "" && protectedCols.includes(col)) {

    if (e.oldValue !== undefined) {
      // Restore the old value
      range.setValue(e.oldValue); 
      
      // If the column being edited is the Date column, force the format back to a Date
      if (col === colIdx["Date"]) {
        range.setNumberFormat("dd/mm/yyyy"); 
      }

      SpreadsheetApp.getUi().alert("⛔ PROTECTED: This event is locked because it has a HexKey.");
      return;
    }
  }

  // --- FEATURE B: GENERATE HEXKEY WHEN ROW IS COMPLETE ---
  // Only generate key if Date, Class, and Regatta Type are all filled
  const eventData = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const isRowComplete = eventData[colIdx["Date"]-1] && 
                        eventData[colIdx["Class"]-1] && 
                        eventData[colIdx["Regatta Type"]-1];

  if (isRowComplete && currentHex === "" && competition === "Competition") {
    let newKey;
    const allExistingKeys = sheet.getRange(2, colIdx["HexKey"], sheet.getLastRow(), 1).getValues().flat();
    
    do {
      newKey = [...Array(8)].map(() => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    } while (allExistingKeys.includes(newKey));

    sheet.getRange(row, colIdx["HexKey"]).setValue(newKey);
    // Optional: Visual cue that the row is now locked
    sheet.getRange(row, 1, 1, headers.length).setBackground("#f3f3f3"); 
  }
}

