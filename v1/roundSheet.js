/**
 * Writes the results for a single round to its own sheet in the regatta book.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} book The target spreadsheet.
 * @param {object} parsed The object containing parsed regatta data (including parsed.date, className, races).
 * @param {object} scoresMap The calculated scores for the round.
 */
function roundWrite(bookID, rankedScores, parsed) {
  if (!rankedScores || !rankedScores.length) return;

  let dateObject = tryNormalizeDate(parsed.date);
  const sheetName = dateObject;
  let ss = SpreadsheetApp.openById(bookID);
  
  // 1. Check if sheet exists before performing any action
  let existingSheet = ss.getSheetByName(sheetName);
  let sh;

  if (existingSheet) {
    sh = existingSheet;
    sh.clear(); 
  } else {
    sh = ss.insertSheet(sheetName);
  }

  // 2. NOW calculate the Round Number
  // This counts the sheets as they exist currently in the workbook
  const allSheets = ss.getSheets();
  const roundNumber = allSheets.length - 1; // Subtract 1 for the Overall Results sheet

  // 3. Dynamic layout indexing
  const raceCount = rankedScores[0].racescore.length;
  const startRow = 7;
  const startCol = 2; 
  const header = ["Pos", "Sail #", "Competitor", "Result"];
  for (let i = 1; i <= raceCount; i++) { header.push(`R${i}`); }
  header.push("Total", "Discard");
  
  const totalCols = header.length;
  const totalColIdx = startCol + totalCols - 2; 
  const discardColIdx = startCol + totalCols - 1; 

  // 4. Metadata Construction (Using the corrected roundNumber)
  sh.getRange("C3:H3").merge()
    .setValue(`${parsed.regattaName} - Round ${roundNumber}`)
    .setFontSize(16).setFontWeight("bold").setBackground("#4A86E8").setFontColor("white")
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  
  sh.getRange("C4:D4").merge()
    .setValue(dateObject).setFontStyle("italic").setHorizontalAlignment("left");

  sh.getRange(3, totalColIdx).setValue(parsed.competitorCount).setHorizontalAlignment("center");
  sh.getRange(3, discardColIdx).setValue("Boats").setHorizontalAlignment("left");
  sh.getRange(4, totalColIdx).setValue(raceCount).setHorizontalAlignment("center");
  sh.getRange(4, discardColIdx).setValue("Races").setHorizontalAlignment("left");

  // 5. Data Population
  const dataRows = [header];
  rankedScores.forEach((sc, index) => {
    const row = [index + 1, sc.sail, sc.member, sc.net];
    sc.placements.forEach((p, rIdx) => {
      let val = sc.discards[rIdx] === true ? "'(" + p + ")" : p;
      row.push(val);
    });
    row.push(sc.gross, (sc.gross - sc.net));
    dataRows.push(row);
  });

  // 6. Write and Finalize
  sh.getRange(startRow, startCol, dataRows.length, totalCols).setValues(dataRows);
  
  const lastRow = startRow + dataRows.length - 1;
  const lastCol = startCol + totalCols - 1;
  if (sh.getMaxRows() > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
  if (sh.getMaxColumns() > lastCol) sh.deleteColumns(lastCol + 1, sh.getMaxColumns() - lastCol);

  applyRoundCardFormatting(sh, startRow, dataRows.length, totalCols);
}