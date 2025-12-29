/**
* Format and post results to Facebook Page
* Requires Page access token with publish_pages permissions
*/

function postResultsAsImagePNG(parsed, scoresMap) {

  // get pageId, pageToken
  if (!pageId || !pageToken) return;

  // Filter only boats that competed at least once
  const list = Object.values(scoresMap)
    .filter(s => (s.placements || []).some(p => typeof p === 'number'))
    .sort((a, b) => a.total - b.total);

  if (!list.length) {
    Logger.log("No boats competed; skipping Facebook post.");
    return;
  }

  const maxRaces = Math.max(...list.map(s => (s.placements || []).length));

  // --- Prepare data table ---
  const dataTable = Charts.newDataTable();
  dataTable.addColumn(Charts.ColumnType.STRING, 'Pos');
  dataTable.addColumn(Charts.ColumnType.STRING, 'Sail');
  dataTable.addColumn(Charts.ColumnType.STRING, 'Competitor');
  dataTable.addColumn(Charts.ColumnType.NUMBER, 'Total');
  for (let i = 1; i <= maxRaces; i++) {
    dataTable.addColumn(Charts.ColumnType.STRING, 'R' + i);
  }

  // --- Add rows with CSS classes ---
  list.forEach((s, idx) => {
    const row = [];

    // Position
    row.push(`<div style="text-align:center;">${String(s.place)}</div>`);

    // Sail number
    row.push(`<div style="text-align:center;">${String(s.sail)}</div>`);

    // Competitor name
    const name = (typeof s.member === 'string') ? s.member : (s.member?.name || '');
    row.push(name);

    // Total
    row.push(`<div style="text-align:center;">${s.total}</div>`);

    // Race results
    for (let i = 0; i < maxRaces; i++) {
      let val = s.placements[i];
      if (typeof val === 'number') {
        if (s.discardedRaces?.includes(i)) val = `(${val})`;
        // Wrap numeric cell with div to center
        val = `<div style="text-align:center;">${val}</div>`;
      } else if (val === 'DNS' || val === 'DNF' || val === 'DNC') {
        val = `<div style="text-align:center;">${val}</div>`;
      } else {
        val = ''; // leave empty
      }
      row.push(val);
    }
    
    dataTable.addRow(row);
  });

  // --- Determine dynamic width ---
  const width = Math.max(900, 250 + maxRaces * 60);

  // --- CSS classes ---
  const cssClasses = {
    headerRow: 'header-row',
    tableCell: 'table-cell'
  };

  // Build chart
  const chart = Charts.newTableChart()
    .setDataTable(dataTable.build())
    .setOption('allowHtml', true)
    .setOption('alternatingRowStyle', true)
    .setOption('width', width)
    .setOption('height', list.length * 40 + 80)
    .setOption('cssClassNames', cssClasses)
    .build();

  // --- Export chart as PNG ---
  const imageBlob = chart.getAs('image/png').setName(parsed.regattaName + '.png');

  // --- Post to Facebook ---
  const fbUrl = `https://graph.facebook.com/${pageId}/photos`;
  const payload = {
    caption: `${parsed.regattaName || ''} - ${parsed.className || ''}\n${parsed.date || ''}`,
    access_token: pageToken,
    source: imageBlob
  };
  const options = {
    method: 'post',
    payload,
    muteHttpExceptions: true
  };

  try {
    const resp = UrlFetchApp.fetch(fbUrl, options);
    Logger.log("FB post response: " + resp.getContentText());
  } catch (e) {
    Logger.log("FB post error: " + e);
  }
}


