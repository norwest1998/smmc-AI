function applySeriesFormatting(sheetID, sheetName) {
  const ss = SpreadsheetApp.openById(sheetID);
  const sh = ss.getSheetByName(sheetName);

  if (!sh) {
    console.log(`applySeriesFormatting: Sheet "${sheetName}" not found in book ${sheetID}`);
    return;
  }

  Logger.log("Formatting: " + sheetName);
  console.log("Formatting: " + sheetName);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow < OVERALL_DATA_START_ROW || lastCol < 2) {
    console.log('applySeriesFormatting: not enough data to format');
    return;
  }

  const hdrRow = OVERALL_HEADER_ROW;
  const lastHdrCol = 7;
  const bodyRowStart = OVERALL_DATA_START_ROW;
  const roundColStart = lastHdrCol + 1;

  // Ensure physical grid is large enough for standard layout (rows 1-7, cols 1-7) & active data
  const requiredRows = Math.max(lastRow, bodyRowStart);
  const requiredCols = Math.max(lastCol, lastHdrCol);

  if (sh.getMaxRows() < requiredRows) {
    sh.insertRowsAfter(sh.getMaxRows(), requiredRows - sh.getMaxRows());
  }
  if (sh.getMaxColumns() < requiredCols) {
    sh.insertColumnsAfter(sh.getMaxColumns(), requiredCols - sh.getMaxColumns());
  }

  const bodyCount = Math.max(0, lastRow - bodyRowStart + 1);
  const roundColCount = Math.max(0, lastCol - lastHdrCol);

  // Spacer row/column sizing (rows 1-2, 5-6)
  sh.setRowHeight(1, 10);
  sh.setColumnWidth(1, 10);
  sh.setColumnWidth(2, 25);
  sh.setColumnWidth(3, 50);
  sh.setRowHeight(2, 10);
  sh.setRowHeight(5, 10);
  sh.setRowHeight(6, 10);

  if (lastCol >= 7) {
    sh.getRange(hdrRow, 2, 1, 6)
      .setBackground("#4A86E8")
      .setFontColor("white")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  }

  sh.getRange(OVERALL_META_ROW_1, 2, 2, 1).setHorizontalAlignment("left");
  sh.getRange(OVERALL_META_ROW_1, 4, 2, 1).setHorizontalAlignment("left");

  if (lastCol >= 7) {
    sh.getRange(OVERALL_META_ROW_1, 7).setHorizontalAlignment("right");
  }

  if (bodyCount > 0) {
    sh.getRange(bodyRowStart, 2, bodyCount, 2).setHorizontalAlignment("center");

    if (lastCol >= 7) {
      sh.getRange(bodyRowStart, 5, bodyCount, 3).setHorizontalAlignment("center");
    }

    sh.getRange(bodyRowStart, 4, bodyCount, 1).setHorizontalAlignment("left").setWrap(false);

    sh.autoResizeColumn(4);
    sh.setColumnWidth(4, sh.getColumnWidth(4) + 30);

    [5, 6, 7].forEach(col => {
      if (col <= lastCol) {
        sh.autoResizeColumn(col);
        sh.setColumnWidth(col, sh.getColumnWidth(col) + 5);
      }
    });
  }

  if (roundColCount > 0 && lastRow >= bodyRowStart) {
    const roundRange = sh.getRange(OVERALL_META_ROW_1, roundColStart, lastRow - OVERALL_META_ROW_1 + 1, roundColCount);
    roundRange.setHorizontalAlignment("center");

    sh.getRange(hdrRow, roundColStart, 1, roundColCount)
      .setBackground("#4A86E8")
      .setFontColor("white")
      .setFontWeight("bold");

    for (let c = roundColStart; c <= lastCol; c++) {
      sh.autoResizeColumn(c);
      sh.setColumnWidth(c, sh.getColumnWidth(c) + 5);
    }
  }

  // Trim excess columns beyond standard headers and round columns
  const maxCols = sh.getMaxColumns();
  const keepCols = Math.max(lastCol, lastHdrCol);
  if (maxCols > keepCols) {
    sh.deleteColumns(keepCols + 1, maxCols - keepCols);
  }
}


function applyRoundCardFormatting(sh) {
 
  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  const hdrCols = 5;
  const hdrRow = 7;
  const hdrColStart = 2;
  const bodyRowStart = hdrRow + 1;
  const bodyCount = lastRow - hdrRow + 1;
  const raceColStart = hdrCols + 1;
  const raceColEnd = lastCol - 5;


  // 1. Specific Pixel Sizing for Margins
  sh.setColumnWidth(1, 10);                           // Column A spacer
  [1, 2, 5, 6].forEach(r => sh.setRowHeight(r, 10));  // Rows 1, 2, 5, 6 spacers

  // 2. Header formatting
  // Main headers
  sh.getRange("C3").  // Round Header
    setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  sh.getRange("C4").setHorizontalAlignment("left");  // Round date

  // Columns outside of set header columns need to be dynamic
  sh.getRange(3,raceColEnd + 1,1,1).setHorizontalAlignment("center").setVerticalAlignment("center");
  sh.getRange(4,raceColEnd + 1,1,1).setHorizontalAlignment("center").setVerticalAlignment("center"); 
  sh.getRange(3,raceColEnd + 2,1,1).setHorizontalAlignment("left").setVerticalAlignment("center"); 
  sh.getRange(4,raceColEnd + 2,1,1).setHorizontalAlignment("left").setVerticalAlignment("center");  

  // Body headers
  sh.getRange(hdrRow,hdrColStart,1,lastCol - hdrColStart +1).
    setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  

  // 3. Table Body Alignment
  // Center everything by default
  sh.getRange(hdrRow, hdrColStart, bodyCount, lastCol - hdrColStart +1)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  // 4. 1st place Highlights (Gold)
  const raceRange = sh.getRange(bodyRowStart, raceColStart, bodyCount -1, raceColEnd - raceColStart +1);
  const values = raceRange.getValues();
  const bgs = values.map(row => row.map(cell => {
    let score = parseInt(String(cell).replace(/\(|\)/g, ''));
    if (score === 1) return "#FFD700";
    return null;
  }));
  raceRange.setBackgrounds(bgs);

  // 5. Final Column Width Adjustments
  sh.autoResizeColumns(hdrColStart, lastCol - 1); // Initial resize for text fit
  
  // Left-align Competitor names and autosize (Column D)
  sh.setColumnWidth(2, 25);
  sh.getRange(hdrRow, 4, bodyCount, 1).setHorizontalAlignment("left").setWrap(false)    
  sh.autoResizeColumn(4);                    // First, fit exactly to content
  const currentWidth = sh.getColumnWidth(4); // Get the auto-resized width
  const margin = 30;                         // Add your desired margin (pixels)
  sh.setColumnWidth(4, currentWidth + margin);
  sh.setColumnWidth(3, 50); // Force narrow Sail # column

  // left align date
  sh.getRange(4, 2,1,1).setHorizontalAlignment("left");
  
  // UNIFORM RACE COLUMNS:
  // Start at column 6 (F), affect the number of race columns
  sh.setColumnWidths(raceColStart, (raceColEnd - raceColStart) + 1, 45); 

  // 6. Dark grey font for cells containing '('  (discarded scores)
  if (raceRange) {
    const values = raceRange.getValues();
    const fontColors = raceRange.getFontColors(); // Preserve existing colors or create new grid

    let changesMade = false;
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < values[i].length; j++) {
        if (typeof values[i][j] === 'string' && values[i][j].includes('(')) {
          fontColors[i][j] = '#c6c1c1';  // Dark grey (adjust hex as needed)
          changesMade = true;
        }
      }
    }

    if (changesMade) {
      raceRange.setFontColors(fontColors);
    }
  }


}