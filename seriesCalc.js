function recalcSeries(sheet) {
  const headers = sheet.getRange(3,1,1,sheet.getLastColumn()).getValues()[0];
  const dncRow = sheet.getRange(2,1,1,headers.length).getValues()[0];

  const firstRoundCol = 7;
  const lastRow = sheet.getLastRow();

  for (let r = 4; r <= lastRow; r++) {
    const row = sheet.getRange(r,1,1,headers.length).getValues()[0];
    const nets = [];
    const dncs = [];

    for (let c = firstRoundCol-1; c < headers.length; c++) {
      if (typeof row[c] === 'number') {
        nets.push(row[c]);
        dncs.push(dncRow[c]);
      }
    }

    const attendance = calculateSeriesAttendance(nets, dncs);
    const series = calculateSeriesTotalsFromNet(nets);

    sheet.getRange(r,1).setValue(attendance);
    sheet.getRange(r,4).setValue(series.total);
    sheet.getRange(r,5).setValue(series.discard);
    sheet.getRange(r,6).setValue(series.total - series.discard);
  }
}

function scoreSeries(dayNets) {
  const total = dayNets.reduce((a, b) => a + b, 0);
  const discardCount = getDiscardCount(dayNets.length);
  const sorted = [...dayNets].sort((a, b) => b - a);
  const discarded = sorted.slice(0, discardCount);
  const discard = discarded.reduce((a, b) => a + b, 0);

  return {
    total,
    discard,
    net: total - discard,
    discarded
  };
}
