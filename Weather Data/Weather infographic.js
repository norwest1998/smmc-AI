function createInfographic() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentSh = ss.getSheetByName('Weather_Current');
  const dailySh = ss.getSheetByName('Daily_Forecast');
  const hourlySh = ss.getSheetByName('Forecast_Hourly');
  let dashSh = ss.getSheetByName('Infographic');
  if (!dashSh) {
    dashSh = ss.insertSheet('Infographic');
  } else {
    dashSh.clear();
    dashSh.clearFormats();
  }

  // Enhanced emoji mapping (fallback)
  function getWeatherIcon(code) {
    if (!code) return '❓';
    code = code.toLowerCase();
    if (code.includes('01')) return code.includes('n') ? '🌙' : '☀️';
    if (code.includes('02')) return '🌤️';
    if (code.includes('03')) return '⛅';
    if (code.includes('04')) return '☁️';
    if (code.includes('09')) return '🌧️';
    if (code.includes('10')) return code.includes('n') ? '🌧️🌙' : '🌦️';
    if (code.includes('11')) return '⛈️';
    if (code.includes('13')) return '❄️';
    if (code.includes('50')) return '🌫️';
    return '🌈';
  }

  function getWindArrow(deg) {
    if (deg === null || deg === '') return '';
    deg = Number(deg) % 360;
    if (deg <= 22.5 || deg > 337.5) return '⬆️ N';
    if (deg <= 67.5) return '↗️ NE';
    if (deg <= 112.5) return '➡️ E';
    if (deg <= 157.5) return '↘️ SE';
    if (deg <= 202.5) return '⬇️ S';
    if (deg <= 247.5) return '↙️ SW';
    if (deg <= 292.5) return '⬅️ W';
    return '↖️ NW';
  }

  // === Current Forecast Section ===
  const currentData = currentSh.getDataRange().getValues();
  const c = currentData[1];

  dashSh.getRange('A1:E1').merge().setValue('Current Forecast')
    .setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setBackground('#1976D2').setFontColor('#FFFFFF');

  dashSh.getRange('A2').setValue(getWeatherIcon(c[16]) + ' ' + c[2] + '°C')
    .setFontSize(36).setHorizontalAlignment('center');
  dashSh.getRange('A3').setValue('Feels like: ' + c[3] + '°C')
    .setFontSize(16);
  dashSh.getRange('A4').setValue(c[15])
    .setFontSize(14).setFontStyle('italic');
  dashSh.getRange('A5').setValue(getWindArrow(c[7]) + ' ' + c[6] + ' m/s   📊 ' + c[5] + ' hPa')
    .setFontSize(14);
  dashSh.getRange('A6').setValue('Humidity: ' + c[4] + '%   UV Index: ' + c[10])
    .setFontSize(14);

  dashSh.getRange('A2:E6').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true);

  // === 8 Day Forecast ===
  let row = 9;
  dashSh.getRange(`A${row}:E${row}`).merge().setValue('8-Day Forecast')
    .setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setBackground('#388E3C').setFontColor('#FFFFFF');

  row += 2;
  dashSh.getRange(row, 1, 1, 5).setValues([['Day', 'Date', 'Temp Min / Max', 'Wind', 'Conditions']])
    .setFontWeight('bold').setBackground('#E0E0E0');

  const dailyData = dailySh.getDataRange().getValues().slice(1);
  row++;
  dailyData.forEach(dayRow => {
    const date = new Date(dayRow[0]);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const icon = getWeatherIcon(dayRow[17]);
    const temp = dayRow[2] + '° / ' + dayRow[3] + '°';
    const wind = dayRow[8] + ' m/s';
    const desc = dayRow[16];

    dashSh.getRange(row, 1, 1, 5).setValues([[dayName, dateStr, icon + ' ' + temp, wind, desc]]);
    row++;
  });

  // === Next 8 Hours Forecast ===
  row += 2;
  dashSh.getRange(`A${row}:G${row}`).merge().setValue('Next 8 Hours Forecast')
    .setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center')
    .setBackground('#F57C00').setFontColor('#FFFFFF');

  row += 2;

  const allHourlyData = hourlySh.getDataRange().getValues();
  const hourlyHeader = allHourlyData[0];
  const hourlyRows = allHourlyData.slice(1);
  const next8Hours = hourlyRows.slice(0, 8); // Next 8 hours

  // Temperature color buckets
  const buckets = [
    { max: 15, color: '#ADD8E6' },   // Light blue ≤15°C
    { max: 20, color: '#90EE90' },   // Light green ≤20°C
    { max: 25, color: '#FFFF00' },   // Yellow ≤25°C
    { max: 29, color: '#FFD700' },   // Gold ≤29°C
    { max: Infinity, color: '#FFA500' }  // Orange >29°C
  ];
  const numTempBuckets = buckets.length;
  const tempColors = buckets.map(b => b.color);

  // Rain series (blue, scaled for visibility)
  const rainHelperCol = 25; // Column Y for rain_mm
  const tempHelperStartCol = 26; // Z onward for temp buckets

  // Clear helpers
  const helperRows = 9; // Header + 8 data
  hourlySh.getRange(1, rainHelperCol, hourlySh.getLastRow(), numTempBuckets + 1).clearContent();

  // Prepare arrays
  const times8 = [['Time'], ...next8Hours.map(r => [r[1]])];
  const rain8 = [['Rain (mm)'], ...next8Hours.map(r => [r[11] || 0])]; // rain_mm index 11
  const temps8 = next8Hours.map(r => r[2]); // temp_c index 2

  const tempHelperValues = [['Temp Bucket 1', 'Temp Bucket 2', 'Temp Bucket 3', 'Temp Bucket 4', 'Temp Bucket 5'],
    ...temps8.map(temp => {
      const bucketRow = new Array(numTempBuckets).fill(null);
      for (let i = 0; i < numTempBuckets; i++) {
        if (temp <= buckets[i].max) {
          bucketRow[i] = temp;
          break;
        }
      }
      return bucketRow;
    })];

  // Write to sheet
  hourlySh.getRange(1, 2, helperRows, 1).setValues(times8);
  hourlySh.getRange(1, rainHelperCol, helperRows, 1).setValues(rain8);
  hourlySh.getRange(1, tempHelperStartCol, helperRows, numTempBuckets).setValues(tempHelperValues);

  // Build chart with two overlaid series: Rain (column, blue) + Temp (line, color gradient)
  let chartBuilder = dashSh.newChart()
    .setChartType(Charts.ChartType.COMBO)
    .addRange(hourlySh.getRange(1, 2, helperRows, 1)) // Time
    .addRange(hourlySh.getRange(1, rainHelperCol, helperRows, 1)) // Rain
    .setPosition(row, 1, 0, 0)
    .setOption('title', 'Next 8 Hours: Temperature (°C) & Rain (mm)')
    .setOption('seriesType', 'line')
    .setOption('legend', { position: 'top' })
    .setOption('hAxis', { title: 'Time', slantedText: true, slantedTextAngle: 45 })
    .setOption('vAxis', { title: 'Temperature (°C)', viewWindow: { min: 10 } })
    .setOption('series', {
      0: { type: 'bars', targetAxisIndex: 1, color: '#2196F3' }, // Rain bars, secondary axis, blue
      1: { color: tempColors[0] },
      2: { color: tempColors[1] },
      3: { color: tempColors[2] },
      4: { color: tempColors[3] },
      5: { color: tempColors[4] }
    })
    .setOption('vAxes', {
      0: { title: 'Temperature (°C)' },
      1: { title: 'Rain (mm)', viewWindow: { min: 0 } }
    })
    .setOption('lineWidth', 5)
    .setOption('pointSize', 6)
    .setOption('backgroundColor', '#FAFAFA')
    .setOption('chartArea', { width: '85%', height: '75%' });

  // Add temp bucket ranges (series 1-5)
  for (let i = 0; i < numTempBuckets; i++) {
    chartBuilder.addRange(hourlySh.getRange(1, tempHelperStartCol + i, helperRows, 1));
  }

  dashSh.insertChart(chartBuilder.build());

  // === Next 8 Hours Details Table with Weather-Based Row Backgrounds ===
  row += 25;
  dashSh.getRange(row, 1, 1, 7).setValues([['Time', 'Icon', 'Temp', 'Rain mm', 'POP %', 'Wind', 'Condition']])
    .setFontWeight('bold').setBackground('#FFF9C4').setHorizontalAlignment('center');
  row++;

  next8Hours.forEach(h => {


    let bgColor = '#FFFFFF'; // default white
    if (desc.includes('clear sky')) {
      bgColor = '#87CEEB'; // sky blue
    } else if (desc.includes('broken clouds')) {
      bgColor = null; // for gradient (set below)
    } else if (desc.includes('overcast clouds')) {
      bgColor = null; // for gradient
    } else if (desc.includes('light rain')) {
      bgColor = null; // for gradient
    }

    dashSh.getRange(row, 1).setFormula(iconUrl).setHorizontalAlignment('center');
    dashSh.getRange(row, 2).setValue(getWeatherIcon(iconCode)); // fallback emoji
    dashSh.getRange(row, 3).setValue(h[2] + '°C');
    dashSh.getRange(row, 4).setValue(h[11] || 0);
    dashSh.getRange(row, 5).setValue((h[10] || 0) + '%');
    dashSh.getRange(row, 6).setValue(h[6] + ' ' + getWindArrow(h[7]));
    dashSh.getRange(row, 7).setValue(h[13]);

    const tableRow = dashSh.getRange(row, 1, 1, 7);
    if (bgColor) {
      tableRow.setBackground(bgColor);
    } else {
      // Gradients via conditional formatting simulation or direct (Sheets supports linear gradients now)
      if (desc.includes('broken clouds')) {
        tableRow.setBackgrounds([['linear-gradient(to top, #FFFFFF, #ADD8E6)']]); // white top, blue bottom? Adjust
      } else if (desc.includes('overcast clouds')) {
        tableRow.setBackgrounds([['linear-gradient(to top, #808080, #FFFFFF)']]); // grey top, white bottom? Note: order
      } else if (desc.includes('light rain')) {
        tableRow.setBackgrounds([['linear-gradient(to top, #A9A9A9, #D3D3D3)']]); // darker grey top, light grey bottom
      }
    }

    row++;
  });

  // Final touches
  dashSh.autoResizeColumns(1, 7);
  dashSh.setColumnWidth(1, 100); // Icon
  dashSh.setColumnWidth(2, 80);
  dashSh.setColumnWidth(7, 200);
}