/**
 * RoundTableRenderer
 * ------------------
 * Pure rendering and extraction utilities for round result tables.
 *
 * Responsibilities:
 *  - Extract normalized round model from a sheet
 *  - Render TableChart for web embedding
 *  - Render PNG (Canvas) for Facebook posting
 */
var RoundTableRenderer = (function () {

  /* ============================
   * 1. EXTRACTION
   * ============================ */

  function extractFromSheet(sheet) {
    const values = sheet.getDataRange().getDisplayValues();

    const headerRowIndex = values.findIndex(r => r[1] === 'Pos');
    if (headerRowIndex === -1) {
      throw new Error('Heading row not found (Pos column missing)');
    }

    const headers = values[headerRowIndex];

    const idx = {
      pos: headers.indexOf('Pos'),
      sail: headers.indexOf('Sail #'),
      name: headers.indexOf('Competitor'),
      total: headers.indexOf('Result')
    };

    const raceCols = [];
    headers.forEach((h, i) => {
      if (/^R\d+$/.test(h)) raceCols.push(i);
    });

    const rows = [];
    for (let r = headerRowIndex + 1; r < values.length; r++) {
      const row = values[r];
      if (!row[idx.pos]) continue;

      rows.push({
        pos: row[idx.pos],
        sail: row[idx.sail],
        name: row[idx.name],
        total: row[idx.total],
        races: raceCols.map(c => row[c])
      });
    }

    return {
      headers: {
        fixed: ['Pos', 'Sail #', 'Competitor', 'Result'],
        races: raceCols.map(c => headers[c])
      },
      rows
    };
  }

  /* ============================
   * 2. WEB RENDERER (TableChart)
   * ============================ */

  function renderForWeb(model) {
    const dt = Charts.newDataTable();

    function td(v, align) {
      return `<div style="text-align:${align}; white-space:nowrap;">${v ?? ''}</div>`;
    }

    // Columns
    model.headers.fixed.forEach(() =>
      dt.addColumn(Charts.ColumnType.STRING)
    );
    model.headers.races.forEach(() =>
      dt.addColumn(Charts.ColumnType.STRING)
    );

    // Rows
    model.rows.forEach(r => {
      const out = [
        td(r.pos, 'center'),
        td(r.sail, 'center'),
        td(r.name, 'left'),
        td(r.total, 'center')
      ];
      r.races.forEach(v => out.push(td(v, 'center')));
      dt.addRow(out);
    });

    const totalWidth =
      40 + 60 + 220 + 60 + model.headers.races.length * 50;

    return Charts.newTableChart()
      .setDataTable(dt.build())
      .setOption('allowHtml', true)
      .setOption('showRowNumber', false)
      .setDimensions(
        totalWidth,
        (model.rows.length + 1) * 34 + 20
      )
      .build();
  }

  /* ============================
   * 3. FACEBOOK RENDERER (Canvas)
   * ============================ */

  function renderForFacebook(model, options = {}) {
    const cfg = Object.assign({
      padding: 40,
      rowHeight: 34,
      headerFont: 'bold 18px Arial',
      bodyFont: '16px Arial',
      bgColor: '#ffffff',
      textColor: '#000000',
      nameColPadding: 8
    }, options);

    const headers = [
      ...model.headers.fixed,
      ...model.headers.races
    ];

    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');

    function measure(text, font) {
      tctx.font = font;
      return tctx.measureText(String(text)).width;
    }

    const colWidths = headers.map(h =>
      measure(h, cfg.headerFont)
    );

    model.rows.forEach(r => {
      const rowVals = [
        r.pos,
        r.sail,
        r.name,
        r.total,
        ...r.races
      ];
      rowVals.forEach((v, i) => {
        colWidths[i] = Math.max(
          colWidths[i],
          measure(v ?? '', cfg.bodyFont)
        );
      });
    });

    colWidths.forEach((_, i) => colWidths[i] += 24);

    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const canvasWidth = tableWidth + cfg.padding * 2;
    const canvasHeight =
      (model.rows.length + 1) * cfg.rowHeight + cfg.padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.textBaseline = 'middle';
    ctx.fillStyle = cfg.textColor;

    let y = cfg.padding;

    // Header
    ctx.font = cfg.headerFont;
    let x = cfg.padding;
    headers.forEach((h, c) => {
      ctx.textAlign = 'center';
      ctx.fillText(
        h,
        x + colWidths[c] / 2,
        y + cfg.rowHeight / 2
      );
      x += colWidths[c];
    });

    y += cfg.rowHeight;

    // Body
    ctx.font = cfg.bodyFont;
    model.rows.forEach(r => {
      const vals = [
        r.pos,
        r.sail,
        r.name,
        r.total,
        ...r.races
      ];

      let x = cfg.padding;
      vals.forEach((v, c) => {
        if (c === 2) {
          ctx.textAlign = 'left';
          ctx.fillText(
            v ?? '',
            x + cfg.nameColPadding,
            y + cfg.rowHeight / 2
          );
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(
            v ?? '',
            x + colWidths[c] / 2,
            y + cfg.rowHeight / 2
          );
        }
        x += colWidths[c];
      });
      y += cfg.rowHeight;
    });

    return canvas.toDataURL('image/png');
  }

  /* ============================
   * PUBLIC API
   * ============================ */

  return {
    extractFromSheet,
    renderForWeb,
    renderForFacebook
  };

})();

