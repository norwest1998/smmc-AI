function applyOverallFormatting() {
  
  // replace this code with sh in teh parameters
  // delete from here
  const shID = "1XQyFDXhBg1U5Aq8ArrRCNBs_X4E91follY3_TqRG664"
  const shName = "Overall Results"
  const ss = SpreadsheetApp.openById(shID);
  const sh = ss.getSheetByName(shName);
  // to here ^^^^^^^^^^^^^^^^^^^^^^
  console.log(sh.getSheetName)

  // 1. Header Column/Row Sizing
  sh.setRowHeight(1, 10);   // separator
  sh.setColumnWidth(1, 10); // Col A
  sh.setColumnWidth(2, 25); // Col B Att
  sh.setColumnWidth(3, 50); // Col C Sail #
  sh.setRowHeight(4, 10);   // separator

  // 2. Series Header Styles (B5:G5)
  sh.getRange("B5:G5").setBackground("#4A86E8")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  const hdrRow = 5;
  const lastHdrCol = 7;

  // 3. Metadata Alignments
  sh.getRange("B2:B3").setHorizontalAlignment("left");    
  sh.getRange("D2:D3").setHorizontalAlignment("left");
  sh.getRange("G2").setHorizontalAlignment("right");
  
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const bodyRowStart  = 6;
  const roundColStart = lastHdrCol + 1;
  const lastBodyCol = lastCol - lastHdrCol;
  const bodyCount = lastRow - bodyRowStart + 1;

  // 4. Series Body Alignment (A-F)
  if (bodyCount > 0) {
    sh.getRange(bodyRowStart, 2, bodyCount, 2).setHorizontalAlignment("center");                      // Attended & Sail
    sh.getRange(bodyRowStart, 5, bodyCount, 3).setHorizontalAlignment("center");                      // Rank, Total, Discard
    sh.getRange(bodyRowStart, 4, bodyCount, 1).setHorizontalAlignment("left").setWrap(false);         // Names    
    sh.autoResizeColumn(4);                    // First, fit exactly to content
    const currentWidth = sh.getColumnWidth(4); // Get the auto-resized width
    var margin = 30;                         // Add your desired margin (pixels)
    sh.setColumnWidth(4, currentWidth + margin);
    sh.autoResizeColumn(5);
    sh.autoResizeColumn(6);
    sh.autoResizeColumn(7);
    margin = 5;
    sh.setColumnWidth(5, sh.getColumnWidth(5) + margin);
    sh.setColumnWidth(6, sh.getColumnWidth(6) + margin);
    sh.setColumnWidth(7, sh.getColumnWidth(7) + margin);
  }

  // 5. Dynamic Round Column Formatting (G onwards)
  if (lastCol >= roundColStart) {
    const roundRange = sh.getRange(2, roundColStart, lastRow - 1, lastBodyCol);
    roundRange.setHorizontalAlignment("center");
    
    // Style Round Headers (Row 4 only)
    sh.getRange(hdrRow, roundColStart, 1, lastBodyCol).setBackground("#4A86E8")
      .setFontColor("white")
      .setFontWeight("bold");
    margin = 5;
    // Auto-resize all round columns
    for (let c = roundColStart; c <= lastCol; c++) {
      sh.autoResizeColumn(c);
      sh.setColumnWidth(c, sh.getColumnWidth(c) + margin);
    }
  }

  // Cut extra Columns
  if (sh.getMaxColumns() > lastCol) {
    Logger.log(lastCol);
    sh.deleteColumns(lastCol + 1, sh.getMaxColumns() - lastCol);
  }
}

