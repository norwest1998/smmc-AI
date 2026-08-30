function createHourlyForecastChartOnDashboard() {
  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);

  const dataSh = ss.getSheetByName('WZ Hourly Data');
  const dashSh = ss.getSheetByName('Dashboard');

  if (!dataSh || !dashSh) {
    throw new Error('Required sheet missing');
  }

  const lastRow = dataSh.getLastRow();
  if (lastRow < 2) return;

  // Remove existing charts
  dashSh.getCharts().forEach(c => dashSh.removeChart(c));

  // Prepare ranges
  const timeRange = dataSh.getRange(1, 1, lastRow, 1); // Column A: Hour
  const tempRange = dataSh.getRange(1, 4, lastRow, 1); // Column C: Temp

  const chart = dashSh.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(timeRange)
    .addRange(tempRange)
    .setPosition(1, 1, 0, 0)
    .setOption('title', 'Hourly Temperature Forecast')
    .setOption('curveType', 'function')
    .setOption('legend', { position: 'none' })
    .setOption('backgroundColor', '#000000')
    .setOption('chartArea', { backgroundColor: '#000000' })
    .setOption('hAxis', {
      title: 'Hour',
      textStyle: { color: '#cccccc' },
      gridlines: { color: '#222222' }
    })
    .setOption('vAxis', {
      title: 'Temperature (°C)',
      textStyle: { color: '#cccccc' },
      gridlines: { color: '#222222' }
    })
    .setOption('colors', ['#ff7a18', '#00ff00', '#00ffff']) // Temp, morning, afternoon
    .setOption('series', {
      1: { lineWidth: 2, lineDashStyle: [2, 2] }, // Morning race dotted line
      2: { lineWidth: 2, lineDashStyle: [2, 2] }  // Afternoon race dotted line
    })
    .build();

  dashSh.insertChart(chart);
}

function newCreateHourlyForecastChartOnDashboard() {
  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);

  const dataSh = ss.getSheetByName('Forecast_Hourly');
  const dashSh = ss.getSheetByName('Dashboard');

  if (!dataSh || !dashSh) {
    throw new Error('Required sheet missing');
  }

  const lastRow = dataSh.getLastRow();
  if (lastRow < 2) return;

  // Remove existing charts
  dashSh.getCharts().forEach(c => dashSh.removeChart(c));

  // Get raw data
  const data = dataSh.getRange(2, 2, lastRow - 1, 2).getValues(); // Column B: Time/Hour, Column C: Temp (starting row 2)

  // Define color buckets: temp thresholds and hex colors (blue low → red high)
  const buckets = [
    { max: 10,  color: '#0000ff' },  // Deep blue
    { max: 15,  color: '#0080ff' },
    { max: 20,  color: '#00ffff' },  // Cyan
    { max: 25,  color: '#00ff00' },  // Green
    { max: 30,  color: '#ffff00' },  // Yellow
    { max: 35,  color: '#ff8000' },  // Orange
    { max: 40,  color: '#ff0000' }   // Red
  ];
Logger.log(buckets);
  const numBuckets = buckets.length;

  // Create helper columns in Forecast_Hourly for each bucket (temp if in bucket, else null)
  // We'll write to columns D to J (or wherever free)
  const startCol = 17; // Column D
  const outputRange = dataSh.getRange(2, startCol, data.length, numBuckets);
  const outputValues = [];

  data.forEach(row => {
    const temp = row[1]; // Temp value
    const bucketRow = [];
    let assigned = false;
    for (let i = 0; i < numBuckets; i++) {
      if (!assigned && temp <= buckets[i].max) {
        bucketRow.push(temp);
        assigned = true;
      } else {
        bucketRow.push(null);
      }
    }
    // If temp > 35, put in last bucket
    if (!assigned) {
      bucketRow[numBuckets - 1] = temp;
    }
    outputValues.push(bucketRow);
  });

  outputRange.setValues(outputValues);

  // Build ranges: time + all bucket columns
  const timeRange = dataSh.getRange(2, 2, data.length, 1); // Hour column
  const seriesRanges = [];
  const colors = [];
  for (let i = 0; i < numBuckets; i++) {
    seriesRanges.push(dataSh.getRange(2, startCol + i, data.length, 1));
    Logger.log("Series " + dataSh.getRange(2, startCol + i, data.length, 1).getValues());
    colors.push(buckets[i].color);
    Logger.log("bucket: " + i + " Colour: " + colors);
  }



  // Build chart with multiple series (overlaid)
  let chartBuilder = dashSh.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(timeRange);

  seriesRanges.forEach(r => chartBuilder.addRange(r));

  chartBuilder
    .setPosition(1, 1, 0, 0)
    .setOption('title', 'Hourly Temperature Forecast (Color by Heat)')
    .setOption('curveType', 'function')
    .setOption('legend', { position: 'none' })
    .setOption('backgroundColor', '#000000')
    .setOption('chartArea', { backgroundColor: '#000000' })
    .setOption('hAxis', {
      title: 'Hour',
      textStyle: { color: '#cccccc' },
      gridlines: { color: '#222222' }
    })
    .setOption('vAxis', {
      title: 'Temperature (°C)',
      textStyle: { color: '#cccccc' },
      gridlines: { color: '#222222' }
    })
    .setOption('colors', colors)  // One color per series
    .setOption('lineWidth', 4)    // Thicker line for visibility
    .setOption('pointSize', 0);   // Hide points if desired

  // Optional: keep your dotted lines for morning/afternoon if still needed (adjust series indices)
  // .setOption('series', { /* ... */ });

  const chart = chartBuilder.build();
  dashSh.insertChart(chart);
}
