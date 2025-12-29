function applyOverallFormatting(sh, rowCount) {
  const lastCol = sh.getLastColumn();

  // 1. Column/Row Sizing
  sh.setRowHeight(1, 10);
  sh.setColumnWidth(1, 15); // Col A
  sh.setColumnWidth(2, 45); // Col B (Sail #)
  sh.autoResizeColumn(3);    // Col C (Member Name)

  // 2. Series Header Styles (A4:F4)
  sh.getRange("A4:F4").setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  // 3. Metadata Alignments
  sh.getRange("B2:C3").setHorizontalAlignment("left");
  sh.getRange("F2").setHorizontalAlignment("right");

  // 4. Series Body Alignment (A-F)
  if (rowCount > 0) {
    sh.getRange(5, 1, rowCount, 2).setHorizontalAlignment("center"); // Attended & Sail
    sh.getRange(5, 3, rowCount, 1).setHorizontalAlignment("left");   // Names
    sh.getRange(5, 4, rowCount, 3).setHorizontalAlignment("center"); // Rank, Total, Discard
  }

  // 5. Dynamic Round Column Formatting (G onwards)
  if (lastCol >= 7) {
    const roundRange = sh.getRange(2, 7, sh.getMaxRows() - 1, lastCol - 6);
    roundRange.setHorizontalAlignment("center");
    
    // Style Round Headers (Row 4 only)
    sh.getRange(4, 7, 1, lastCol - 6).setBackground("#4A86E8")
      .setFontColor("white")
      .setFontWeight("bold");
    
    // Auto-resize all round columns
    for (let c = 7; c <= lastCol; c++) {
      sh.autoResizeColumn(c);
    }
  }
}

function applyRoundCardFormatting(sh, startRow, rowCount, colCount) {
  // 1. Specific Pixel Sizing for Margins
  sh.setColumnWidth(1, 10); // Column A
  [1, 2, 5, 6].forEach(r => sh.setRowHeight(r, 10)); // Rows 1, 2, 5, 6

  // 2. Header Blue Bar Styling
  sh.getRange(startRow, 2, 1, colCount)
    .setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  // 3. Table Body Alignment
  // Center everything by default
  sh.getRange(startRow + 1, 2, rowCount - 1, colCount)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  
  // Left-align Competitor names (Column D)
  sh.getRange(startRow + 1, 4, rowCount - 1, 1).setHorizontalAlignment("left"); 

  // 4. Podium Highlights (Gold/Blue/Red)
  const raceRange = sh.getRange(startRow + 1, 6, rowCount - 1, colCount - 6);
  const values = raceRange.getValues();
  const bgs = values.map(row => row.map(cell => {
    let score = parseInt(String(cell).replace(/\(|\)/g, ''));
    if (score === 1) return "#FFD700";
    if (score === 2) return "#4A86E8";
    if (score === 3) return "#E06666";
    return null;
  }));
  raceRange.setBackgrounds(bgs);

  // 5. Final Column Width Adjustments
  sh.autoResizeColumns(2, colCount); // Initial resize for text fit
  
  sh.setColumnWidth(3, 50); // Force narrow Sail # column
  
  // UNIFORM RACE COLUMNS:
  // Start at column 6 (F), affect the number of race columns
  const numRaceCols = colCount - 6; 
  if (numRaceCols > 0) {
    sh.setColumnWidths(6, numRaceCols, 45); 
  }
}