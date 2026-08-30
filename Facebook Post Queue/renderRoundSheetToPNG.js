  function renderRoundSheetToPNG(spreadsheetId, roundSheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetById(roundSheetId);
  const values = sheet.getDataRange().getDisplayValues();

  // 1. Locate header row
  const headerRowIndex = values.findIndex(r => r[2] === 'Sail #' && r[1] === 'Pos');
  if (headerRowIndex === -1) {
    throw new Error('Header row not found');
  }

  const headers = values[headerRowIndex];

  // 2. Identify columns
  const idx = {
    pos: headers.indexOf('Pos'),
    sail: headers.indexOf('Sail #'),
    name: headers.indexOf('Competitor'),
    result: headers.indexOf('Result')
  };

  const raceCols = headers
    .map((h, i) => ({ h, i }))
    .filter(o => /^R\d+$/.test(o.h))
    .map(o => o.i);

  // 3. Build DataTable
  const dt = Charts.newDataTable();

  dt.addColumn(Charts.ColumnType.STRING, 'Pos');
  dt.addColumn(Charts.ColumnType.STRING, 'Sail #');
  dt.addColumn(Charts.ColumnType.STRING, 'Competitor');
  dt.addColumn(Charts.ColumnType.STRING, 'Result');

  raceCols.forEach(i => dt.addColumn(Charts.ColumnType.STRING, headers[i]));

  // 4. Helper: render race cell HTML
  function renderRaceCell(value) {
    if (!value) return '';

    // Parenthesised discard
    const m = value.match(/^\((.+)\)$/);
    if (m) {
      return (
        '<div style="text-align:center;font-size:11px;">' +
          '<span style="color:#999;">(</span>' +
          m[1] +
          '<span style="color:#999;">)</span>' +
        '</div>'
      );
    }

    // Normal value or DNF
    return '<div style="text-align:center;font-size:11px;">' + value + '</div>';
  }

  // 5. Populate rows
  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const row = values[r];
    if (!row[idx.pos]) continue;

    const out = [
      '<div style="text-align:center;">' + row[idx.pos] + '</div>',
      '<div style="text-align:center;">' + row[idx.sail] + '</div>',
      '<div style="text-align:left;">' + row[idx.name] + '</div>',
      '<div style="text-align:center;font-weight:bold;">' + row[idx.result] + '</div>'
    ];

    raceCols.forEach(c => out.push(renderRaceCell(row[c])));
    dt.addRow(out);
  }

  // 6. Dimensions
  const rowCount = values.length - headerRowIndex - 1;
  const totalWidth =
    40 +   // Pos
    60 +   // Sail
    220 +  // Competitor
    60 +   // Result
    raceCols.length * 48;

  const chart = Charts.newTableChart()
    .setDataTable(dt.build())
    .setOption('allowHtml', true)
    .setOption('showRowNumber', false)
    .setOption('cssClassNames', {
      headerRow: 'font-weight:bold'
    })
    .setOption('columns', {
      0: { width: 40 },
      1: { width: 60 },
      2: { width: 220 },
      3: { width: 60 }
    })
    .setDimensions(
      totalWidth,
      (rowCount + 1) * 34 + 24
    )
    .build();

  return chart.getAs('image/png').setName('RoundResults.png');
}



function postPNGToFacebook(pngBlob, caption) {
  const cfg = getConfig();
  if (!cfg.fbPageId || !cfg.fbToken) {
    throw new Error('Facebook credentials missing');
  }

  const response = UrlFetchApp.fetch(
    `https://graph.facebook.com/${cfg.fbPageId}/photos`,
    {
      method: 'post',
      payload: {
        source: pngBlob,
        caption,
        access_token: cfg.fbToken
      },
      muteHttpExceptions: true
    }
  );

  const result = JSON.parse(response.getContentText());
  if (!result.id) {
    throw new Error(response.getContentText());
  }

  return result.id;
}

