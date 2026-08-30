function applyRoundCardFormatting() {
  // replace this code with sh in teh parameters
  // delete from here
  const sh = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  // to here ^^^^^^^^^^^^^^^^^^^^^^
  
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