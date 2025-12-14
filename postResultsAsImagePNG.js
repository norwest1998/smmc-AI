function postResultsAsImagePNG(parsed, scoresMap, masterData, pageId, pageToken) {
  if (!pageId || !pageToken) return;

  const regatta = parsed.regattaName;
  const dateObj = parsed.date instanceof Date ? parsed.date : new Date(parsed.date);
  const dateSheet = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const dateDisplay = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'dd/MM/yyyy');

  const bookId = getConfigValue(`regattaWorkbookId_${regatta}`);
  const book = SpreadsheetApp.openById(bookId);

  let sheetName = dateSheet;
  let i = 1;
  while (book.getSheetByName(sheetName)) sheetName = `${dateSheet} (${i++})`;
  const sh = book.insertSheet(sheetName);

  sh.getRange('A1').setValue(regatta);
  sh.getRange('A2').setValue(dateDisplay);

  const competitors = Object.values(scoresMap);
  const competitorCount = competitors.length;
  const raceCount = Math.max(...competitors.map(c => c.placements.length));

  const headers = ['Pos','Sail','Competitor','Total','Discard','Net'];
  for (let r = 1; r <= raceCount; r++) headers.push(`R${r}`);
  sh.getRange(3,1,1,headers.length).setValues([headers]);

  const rows = [];

  competitors.forEach(c => {
    const scored = scoreRaceDay(c.placements, competitorCount);
    rows.push({
      sail: c.sail,
      name: c.member,
      placements: c.placements,
      scored
    });
  });

  rows.sort((a,b) => a.scored.net - b.scored.net);

  rows.forEach((r,idx) => {
    const row = [
      idx+1,
      r.sail,
      r.name,
      r.scored.total,
      r.scored.discard,
      r.scored.net,
      ...r.placements
    ];
    sh.appendRow(row);
    markDiscardCells(sh, sh.getLastRow(), 7, r.placements, r.scored.discardedValues);
  });

  formatLikeFacebook(sh,3,headers.length);
  sh.setFrozenRows(3);
  sh.autoResizeColumns(1,headers.length);

  postFacebookImage(rows, headers, regatta, dateDisplay, parsed.raceReport, pageId, pageToken);
}

