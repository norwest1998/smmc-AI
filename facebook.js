/* facebook.gs
 * Formats and posts the exact text layout you requested to Facebook page feed.
 */
function postFacebookImage(rows, headers, regatta, date, report, pageId, token) {
  const table = Charts.newDataTable();
  headers.forEach(h => table.addColumn(Charts.ColumnType.STRING,h));

  rows.forEach((r,i) => {
    table.addRow([
      `${i+1}`, r.sail, r.name,
      `${r.scored.total}`,
      `${r.scored.discard}`,
      `${r.scored.net}`,
      ...r.placements.map(v => typeof v === 'number' ? `${v}` : v)
    ]);
  });

  const chart = Charts.newTableChart()
    .setDataTable(table.build())
    .setOption('allowHtml', true)
    .setOption('width', Math.max(900, 300 + headers.length * 60))
    .setOption('height', rows.length * 40 + 100)
    .build();

  UrlFetchApp.fetch(
    `https://graph.facebook.com/${pageId}/photos`,
    {
      method: 'post',
      payload: {
        caption: `${regatta}\n${date}\n${report || ''}`,
        access_token: token,
        source: chart.getAs('image/png')
      }
    }
  );
}

