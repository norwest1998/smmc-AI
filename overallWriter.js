/* overallWriter.gs
 *  Append computed totals to the Overall Results spreadsheet
 *  (one row per competitor per competition, one column per round) 
/*********************************************
 * Persist / retrieve regatta workbook ids
 */

function writeOverallResults(parsed, dailyRows) {
  const regatta = parsed.regattaName;
  const dateKey = Utilities.formatDate(parsed.date, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const book = SpreadsheetApp.openById(
    getConfigValue(`regattaWorkbookId_${regatta}`)
  );

  let sh = book.getSheetByName('OverallResults');
  if (!sh) {
    sh = book.insertSheet('OverallResults');
    sh.getRange(3,1,1,6).setValues([
      ['Attended','Name','Sail','Total','Discard','Net']
    ]);
  }

  let headers = sh.getRange(3,1,1,sh.getLastColumn()).getValues()[0];
  if (!headers.includes(dateKey)) {
    headers.push(dateKey);
    sh.getRange(3,1,1,headers.length).setValues([headers]);
  }

  const roundCol = headers.indexOf(dateKey) + 1;
  const roundDNC = parsed.raceCount * (parsed.competitorCount + 1);

  sh.getRange(1, roundCol).setValue('DNC');
  sh.getRange(2, roundCol).setValue(roundDNC);

  dailyRows.forEach(r => {
    const rows = sh.getDataRange().getValues();
    let rowIdx = rows.findIndex(x => x[2] === r.sail);

    if (rowIdx === -1) {
      const newRow = Array(headers.length).fill('');
      newRow[1] = r.name;
      newRow[2] = r.sail;
      newRow[roundCol-1] = r.scored.net;
      sh.appendRow(newRow);
    } else {
      sh.getRange(rowIdx+1, roundCol).setValue(r.scored.net);
    }
  });

  recalcSeries(sh);
}
