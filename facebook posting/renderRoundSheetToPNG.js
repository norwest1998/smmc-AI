function renderRoundSheetToPNG(spreadhseetID, roundSheetId) {
  const ss = SpreadsheetApp.openById(spreadhseetID);
  const sheet = ss.getSheetById(roundSheetId);
  const values = sheet.getDataRange().getDisplayValues();

  const headerRowIndex = values.findIndex(r => String(r[1]).trim() === 'Pos');
  if (headerRowIndex === -1) {
    throw new Error('Heading row not found');
  }

  const headers = values[headerRowIndex].map(h => String(h).trim());

  const idx = {
    pos: headers.indexOf('Pos'),
    sail: headers.indexOf('Sail #'),
    name: headers.indexOf('Competitor'),
    result: headers.indexOf('Result')
  };

  const raceCols = [];
  headers.forEach((h, i) => {
    if (/^R\d+$/.test(h)) raceCols.push(i);
  });

  const dt = Charts.newDataTable();
  dt.addColumn(Charts.ColumnType.STRING, 'Pos');
  dt.addColumn(Charts.ColumnType.STRING, 'Sail #');
  dt.addColumn(Charts.ColumnType.STRING, 'Competitor');
  dt.addColumn(Charts.ColumnType.STRING, 'Result');
  raceCols.forEach(c => dt.addColumn(Charts.ColumnType.STRING, headers[c]));

  let rowCount = 0;

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    if (!values[r][idx.pos]) continue;
    const posVal   = String(values[r][idx.pos]   || '').trim();
    const sailVal  = String(values[r][idx.sail]  || '').trim();
    const nameVal  = values[r][idx.name] || '';               // name stays plain
    const resultVal = String(values[r][idx.result] || '').trim();
    const row = [
      `<span style="display:inline-block; width:40px; text-align:center;">${posVal}</span>`,
      `<span style="display:inline-block; width:60px; text-align:center;">${sailVal}</span>`,
      nameVal,   // ← left aligned, no wrap
      `<span style="display:inline-block; width:50px; text-align:center;">${resultVal}</span>`
    ];

    raceCols.forEach(c => {
      let val = String(values[r][c] || '').trim();
      if (val.startsWith('(') && val.endsWith(')')) {
      // dropped races: italic + gray + centered
        val = `<span style="display:inline-block; width:50px; text-align:center;"><i style="color:#777;">${val}</i></span>`;
      } else {
        // normal race result: centered
        val = `<span style="display:inline-block; width:50px; text-align:center;">${val}</span>`;
      }
      row.push(val)
      });
    dt.addRow(row);
    rowCount++;
  }

  const totalWidth = 40 + 60 + 220 + 55 + raceCols.length * 50;
  const totalHeight = (rowCount + 1) * 32 + 30;

  const chart = Charts.newTableChart()
    .setDataTable(dt.build())
    .setOption('allowHtml', true)
    .setOption('showRowNumber', false)
    .setOption('cssClassNames', {               // only helps if embedded, but harmless
      headerRow: 'bold-header',
      tableRow: '',
      oddTableRow: 'odd-row'    })
    .setOption('alternatingRowStyle', true)     // light gray alternate rows
    .setDimensions(totalWidth, totalHeight)
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

