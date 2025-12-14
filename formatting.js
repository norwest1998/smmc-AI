function formatLikeFacebook(sheet, headerRow, colCount) {
  sheet.getRange(headerRow,1,1,colCount)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(headerRow+1,1,sheet.getLastRow(),colCount)
    .setHorizontalAlignment('center');

  sheet.getRange(headerRow+1,3,sheet.getLastRow())
    .setHorizontalAlignment('left');
}

function markDiscardCells(sheet, row, firstRaceCol, placements, discardedValues) {
  placements.forEach((v,i) => {
    if (discardedValues.includes(v)) {
      const cell = sheet.getRange(row, firstRaceCol + i);
      cell.setValue(`(${v})`)
          .setFontColor('#666')
          .setBackground('#f2f2f2');
    }
  });
}

