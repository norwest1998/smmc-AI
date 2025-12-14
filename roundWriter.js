function writeRegattaRoundSheet(book, parsed, scoresMap) {
  const sheetName = Utilities.formatDate(
    new Date(parsed.date),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );

  const sh = book.getSheetByName(sheetName) || book.insertSheet(sheetName);
  sh.clear();

  // ---------- Headers ----------
  sh.getRange('A1').setValue(parsed.regattaName);
  sh.getRange('A2').setValue(parsed.date);
  sh.getRange('A3').setValue('');

  const headers = ['Pos', 'Sail', 'Competitor', 'Total', 'Discard', 'Net'];
  const raceCount = Math.max(...Object.values(scoresMap).map(s => s.placements.length));
  for (let i = 1; i <= raceCount; i++) headers.push(`R${i}`);

  sh.getRange(4, 1, 1, headers.length).setValues([headers]);

  // ---------- Data ----------
  const rows = [];

  Object.values(scoresMap).forEach(s => {
    const races = s.placements.map(v => typeof v === 'number' ? v : null);
    const discardCount = getDiscardCount(races.length);

    const sorted = [...races].sort((a, b) => b - a);
    const discarded = sorted.slice(0, discardCount);
    const kept = sorted.slice(discardCount);

    const total = races.reduce((a, b) => a + b, 0);
    const discard = discarded.reduce((a, b) => a + b, 0);
    const net = kept.reduce((a, b) => a + b, 0);

    const raceCells = s.placements.map(v =>
      discarded.includes(v) ? `(${v})` : v
    );

    rows.push([
      '', s.sail, s.member,
      total, discard, net,
      ...raceCells
    ]);
  });

  rows.sort((a, b) => a[5] - b[5]); // sort by Net

  rows.forEach((r, i) => r[0] = i + 1);

  sh.getRange(5, 1, rows.length, headers.length).setValues(rows);

  // ---------- Formatting ----------
  sh.getRange(4, 1, sh.getLastRow(), headers.length)
    .setHorizontalAlignment('center');

  sh.getRange(5, 3, sh.getLastRow(), 1)
    .setHorizontalAlignment('left');
}
