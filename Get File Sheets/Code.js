function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(e.parameter.ss);

    if (e.parameter.sheet) {
      const sheet = ss.getSheetByName(e.parameter.sheet);
      if (!sheet) throw new Error('Sheet not found: ' + e.parameter.sheet);

      const values = sheet.getDataRange().getValues();
      const tz = ss.getSpreadsheetTimeZone();
      const fmt = cell => cell instanceof Date ? Utilities.formatDate(cell, tz, 'yyyy/MM/dd') : cell;

      // Get Race/Championship Meta Data
      const name = values[2][1];
      const date = fmt(values[3][1]); 


      // Rows 1-6: race/championship info — collect whatever cells are actually filled in
      const meta = [                
        values[2][1],       // Row 3, Column B
        fmt(values[2][3]),  // Row 3, Column D
        fmt(values[3][1]),
        values[3][3]        // Row 4, Column D
      ];

      const headers = values[6];               // row 7 = real column headers
      const dataRows = values.slice(7)
        .filter(r => r.some(c => c !== ''))
        .map(r => r.map(fmt));

      return json({ meta, headers, rows: dataRows });
    }

    // LIST MODE — return matching sheet names (unchanged from Defore)
    const sheets = ss.getSheets()
      .map(s => ({ name: s.getName(), gid: s.getSheetId() }))
      .filter(s => /overall\s*results/i.test(s.name) || /^round\s*\d+$/i.test(s.name));

    sheets.sort((a, b) => {
      const an = /^round\s*(\d+)$/i.exec(a.name);
      const bn = /^round\s*(\d+)$/i.exec(b.name);
      if (!an) return -1;
      if (!bn) return 1;
      return parseInt(an[1]) - parseInt(bn[1]);
    });

    return json({ sheets });
  } catch (err) {
    return json({ error: err.message });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// webAppUrl: https://script.google.com/macros/s/AKfycbxaLDa75WGJ8yqzEnAoLQbvfIyxT9ZDG-YJLP2qSQFtDTEvnbgbjZpsX_7aFcOu0sdl/exec