function applyRoundCardFormatting(sh) {
  const lastCol = sh.getLastColumn();
  const hdrCols = 6;
  const hdrRow = 5;
  const hdrColStart = 2;
  const bodyRowStart = hdrRow + 1;
  const raceColStart = hdrCols + 1;
  const boats = sh.getRange("G2").getValue();
  const races = sh.getRange("G3").getValue();
  const raceColEnd = raceColStart + races -1;

  // 1. Specific Pixel Sizing for Margins
  sh.setColumnWidth(1, 10);                           // Column A spacer
  [1, 4].forEach(r => sh.setRowHeight(r, 10));      // Rows 1, 4 spacers

  // 2. Header formatting
  // Main headers
  sh.getRange("C2").  // Round Header
    setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("left");
  sh.getRange("C3").setHorizontalAlignment("left");  // Round date

  // Columns outside of set header columns need to be dynamic
  sh.getRange(2,7,1,1).setHorizontalAlignment("center").setVerticalAlignment("center");
  sh.getRange(3,7,1,1).setHorizontalAlignment("center").setVerticalAlignment("center"); 
  sh.getRange(2,6,1,1).setHorizontalAlignment("left").setVerticalAlignment("center"); 
  sh.getRange(3,6,1,1).setHorizontalAlignment("left").setVerticalAlignment("center");
  sh.autoResizeColumn(6);    

  // Body headers
  sh.getRange(hdrRow,hdrColStart,1,lastCol - hdrColStart +1).
    setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  

  // 3. Table Body Alignment
  // Center everything by default
  sh.getRange(hdrRow, hdrColStart, boats + 1, lastCol - hdrColStart +1)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  // 4. 1st place Highlights (Gold)
  const raceRange = sh.getRange(bodyRowStart, raceColStart, boats +1, races +1);
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
  sh.getRange(hdrRow, 3, boats + 1, 1).setHorizontalAlignment("left").setWrap(false)    
  sh.autoResizeColumn(2);                    // First, fit exactly to content
  const currentWidth = sh.getColumnWidth(3); // Get the auto-resized width
  const margin = 30;                         // Add your desired margin (pixels)
  sh.setColumnWidth(3, currentWidth + margin);
  sh.setColumnWidth(4, 50); // Force narrow Sail # column
  
  // UNIFORM RACE COLUMNS:
  // Start at column 6 (F), affect the number of race columns
  sh.setColumnWidths(raceColStart, races + 1, 45); 

  // 6. Dark grey font for cells containing '('  (typically discarded scores)
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
