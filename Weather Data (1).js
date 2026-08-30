//======================================
// FILE: appsscript.html
//======================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Drive",
        "version": "v2",
        "serviceId": "drive"
      }
    ]
  },
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}

//======================================
// FILE: Parameters.gs
//======================================

function buildMenu() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Get Weather Data')
    .addItem('Refresh Daily', 'fetchWZDaily')
    .addSeparator()
    .addItem('Get History', 'fetchWZHistoricalWeather')
    .addSeparator()
    .addItem('Get Current Weather', 'fetchWZCurrent')
    .addToUi();
}

function getWeatherConfig() {
  return {
    apiKey: 'bd2c6defafaebe97b09000ce909a7594',
    lat: -33.7312,       // example: Sydney
    lon: 150.9629,
    units: 'metric',
    spreadsheetId: '1EYuf5wi4Gw-4WP1hdg9sZsOO9tbRx_Z-q5go8BBEOGc',
    weatherFolderID: '1eJI3ky3bcn4FhBXu0tzneYvdyWJ4Ih98',
    sheetName: 'Forecast_3H'
  };
}




//======================================
// FILE: Icon Map.gs
//======================================

function resolveWeatherIcon(iconCode) {
  const map = {
    '01d':'☀️','01n':'🌙','02d':'🌤️','02n':'☁️',
    '03d':'☁️','03n':'☁️','04d':'☁️','04n':'☁️',
    '09d':'🌧️','09n':'🌧️','10d':'🌦️','10n':'🌧️',
    '11d':'⛈️','11n':'⛈️','13d':'❄️','13n':'❄️',
    '50d':'🌫️','50n':'🌫️'
  };
  return map[iconCode] || '🌤️';
}

function getWindArrowSvg(deg) {
  return `
  <svg width="40" height="40" viewBox="0 0 100 100"
       style="transform:rotate(${deg}deg)">
    <polygon points="50,5 65,60 50,50 35,60" fill="#333"/>
    <rect x="47" y="50" width="6" height="40" fill="#333"/>
  </svg>`;
}

/**
 * Returns the arrow based on degree value from Parameters sheet
 * @param {number} degree The input degree value
 * @return {string} The corresponding arrow or "No match"
 * @customfunction
 */
function getArrow(degree) {
  if (degree === "" || degree === null) return "";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const paramSheet = ss.getSheetByName("Parameters");
  
  if (!paramSheet) return "Sheet 'Parameters' not found";

  // Get data from columns L (12), M (13), O (15) – assuming headers in row 1, data from row 2
  const data = paramSheet.getRange("J2:M" + paramSheet.getLastRow()).getValues();

  for (let i = 0; i < data.length; i++) {
    const lower = data[i][0];   // Column L
    const upper = data[i][1];   // Column M
    const arrow = data[i][3];   // Column O (index 3 because L=0, M=1, N=2, O=3)

    // Skip empty rows
    if (lower === "" && upper === "" && arrow === "") continue;

    // Handle inclusive lower, inclusive upper (adjust as needed)
    if (degree >= lower && degree <= upper) {
      return arrow || "No arrow";
    }
  }

  return "Out of range";  // No matching range found
}



//======================================
// FILE: Archive Data.gs
//======================================

function archiveHourlyForecast(data) {
  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const sheet = ss.getSheetByName('Hourly_Archive') || ss.insertSheet('Hourly_Archive');

  const timestamp = new Date();
  const rows = data.map(entry => [
    timestamp,
    new Date(entry.dt * 1000),     // forecast hour
    entry.temp,
    entry.weather[0].icon,
    entry.weather[0].description,
    entry.wind_speed,
    entry.wind_deg,
    entry.pop,
    entry.rain ? hour.rain['1h'] || 0 : 0
  ]);

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function archiveDailyOverview(overview) {
  if (!dailyData) return;

  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const sheet = ss.getSheetByName('Overview_Archive') || ss.insertSheet('Overview_Archive');

  const timestamp = new Date();
  const row = [
    timestamp,
    Utilities.formatDate(new Date(overview.dt * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    overview.date,
    overview.units,
    overview.weather_overview,
  ];

  sheet.appendRow(row);
}

function archiveCurrentWeather(currentData) {
  if (!currentData) return;

  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const sheet = ss.getSheetByName('Current_Archive') || ss.insertSheet('Current_Archive');

  const timestamp = new Date();
  const row = [
    timestamp,
    Utilities.formatDate(new Date(currentData.dt * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    currentData.temp,
    currentData.feels_like,
    currentData.humidity,
    currentData.pressure,
    currentData.wind_speed,
    currentData.wind_deg,
    currentData.wind_gust ?? null,
    currentData.clouds,
    currentData.rain,
    currentData.rain_mm,
    currentData.uvi,
    currentData.visibility,
    currentData.weather?.[0]?.main ?? '',
    currentData.weather?.[0]?.description ?? '',
    currentData.weather?.[0]?.icon ?? ''
  ];

  sheet.appendRow(row);
}

function archiveDailyForecast(data) {
  if (!data) return;

  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const sheet = ss.getSheetByName('Daily_Archive') || ss.insertSheet('Daily_Archive');

  const timestamp = new Date();
  const rows = data.map(entry => [
    timestamp,
    Utilities.formatDate(new Date(entry.dt * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    entry.temp?.min ?? null,
    entry.temp?.max ?? null,
    entry.temp?.day ?? null,
    entry.feels_like?.day ?? null,
    entry.humidity,
    entry.pressure,
    entry.wind_speed,
    entry.wind_deg,
    entry.wind_gust ?? null,
    entry.clouds,
    entry.pop ?? 0,
    entry.rain ?? 0,
    entry.uvi,
    entry.weather?.[0]?.main ?? '',
    entry.weather?.[0]?.description ?? '',
    entry.weather?.[0]?.icon ?? ''
  ]);

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

//======================================
// FILE: Create Hourly Chart.gs
//======================================

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


//======================================
// FILE: Build Chart MetaData.gs
//======================================

function buildHourlyMetadataStrip(targetDate) {
  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  if(!targetDate) targetDate = new Date();

  const src = ss.getSheetByName('Forecast_Hourly');
  const dash = ss.getSheetByName('Dashboard');

  if (!src || !dash) {
    throw new Error('Required sheet missing');
  }

  const tz = Session.getScriptTimeZone();
  const dayKey = Utilities.formatDate(targetDate, tz, 'yyyy-MM-dd');

  const data = src.getDataRange().getValues();
  data.shift(); // headers

  // Filter rows for target day
  const hours = data
    .map(r => {
      const dt = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
      const arrow = getArrow(r[7])
      return {
        dt,
        time: Utilities.formatDate(dt, tz, 'HH:mm'),
        icon: resolveWeatherIcon(r[14]),
        desc: r[13],
        wind: r[6] + " " + arrow
      };
    })
    .filter(h =>
      Utilities.formatDate(h.dt, tz, 'yyyy-MM-dd') === dayKey
    );

  if (!hours.length) return;

  // Clear previous strip
  dash.getRange('B20:ZZ23').clearContent();

  // Write rows
  dash.getRange(20, 2, 1, hours.length)
    .setValues([hours.map(h => h.time)]);

  dash.getRange(21, 2, 1, hours.length)
    .setValues([hours.map(h => h.icon)]);

  dash.getRange(22, 2, 1, hours.length)
    .setValues([hours.map(h => h.desc)]);

  dash.getRange(23, 2, 1, hours.length)
    .setValues([hours.map(h => h.wind)]);
}


//======================================
// FILE: Helpers.gs
//======================================





function getEmoji(main) {
  const map = { 
    '0': '☀️',
    '1': '🌤️',
    '2': '⛅',
    '3': '☁️',
    '45': '☁️',
    '51': '🌦️',
    '53': '🌦️',
    '55': '🌦️',
    '56': '🌧️',
    '57': '🌧️',
    '61': '🌧️',
    '63': '🌧️',
    '65': '🌧️',
    '80': '🌧️',
    '81': '🌧️',
    '82': '🌧️',
    '95': '⛈️',
    '96': '⛈️',
    '99': '⛈️' 
  };
  return map[main] || '🌡️';
}

function getWindArrow(deg) {
  if (deg > 337.5 || deg <= 22.5) return "⬇️";
  if (deg > 22.5 && deg <= 67.5) return "↙️";
  if (deg > 67.5 && deg <= 112.5) return "⬅️";
  if (deg > 112.5 && deg <= 157.5) return "↖️";
  if (deg > 157.5 && deg <= 202.5) return "⬆️";
  if (deg > 202.5 && deg <= 247.5) return "↗️";
  if (deg > 247.5 && deg <= 292.5) return "➡️";
  if (deg > 292.5 && deg <= 337.5) return "↘️";
  return "➡️";
}

/**
 * Returns a Date object representing the next Saturday from today.
 * If today is Saturday, returns today.
 */
function getNextSaturday(fromDate) {
  fromDate = fromDate || new Date();
  const dayOfWeek = fromDate.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const nextSaturday = new Date(fromDate);
  nextSaturday.setDate(fromDate.getDate() + daysUntilSaturday);
  nextSaturday.setHours(0, 0, 0, 0); // reset to midnight
  return nextSaturday;
}

function isSaturdayWithinNextNDays(n = 2) {
  const now = new Date();
  const saturday = getNextSaturday();
  const diffDays = Math.ceil((saturday - now) / (1000 * 60 * 60 * 24));
  return diffDays <= n;
}

function getTempColor(temp) {
  temp = parseFloat(temp);  // Ensure it's a number
  if (temp > 35) return '#ff3300';  // Red (matches your existing .high)
  if (temp > 30) return '#ff9900';  // Orange
  if (temp > 15) return '#ffffff';  // White
  if (temp > 8) return '#4dff88';   // White
  if (temp > 0) return '#00ffff';   // Ice Blue  
  return 'white';
}

function getUVColor(index) {
  temp = parseFloat(index);  // Ensure it's a number
  if (index > 10) return '#5900b3';  // Purple
  if (index > 8) return '#ff3300';   // Red
  if (index > 5) return '#ff6600';   // Dark Orange
  if (index > 2) return '#e6b800';   // Light Orange  
  return '88cc00';                   // Green 
}
// Helper: consistent fallback image
function getFallbackImage() {
  return 'https://images.unsplash.com/photo-1601134467661-3d775b999c8b?ixlib=rb-4.0.3&auto=format&fit=crop&q=80'; // clear sky
}

function loadBackgroundRegistry() {
  //const cache = CacheService.getScriptCache();
  //const cached = cache.get("WZ_BG_REGISTRY");
  //if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("WZ Image Registry");
  if (!sh) throw new Error("Missing sheet: WZ Image Registry");

  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const map = {};

  rows.forEach(([code, fileId, size, active]) => {
    if (!active || !fileId) return;

    map[Number(code)] = getDriveImageUrl(
      String(fileId).trim(),
      size || 1200
    );
  });

  //cache.put("WZ_BG_REGISTRY", JSON.stringify(map), 21600); // 6 hrs
  return map;
}

function normalizeDriveId(id) {
  return String(id)
    .trim()
    .replace(/.*\/d\//, "")
    .replace(/\/.*/, "");
}

function getDriveImageUrl(fileId, size = 1200) {
  const cleanId = normalizeDriveId(fileId);
  return `https://lh3.googleusercontent.com/d/${cleanId}=w${size}`;
}


function getBackgroundImage(code) {
  const registry = loadBackgroundRegistry();
  return registry[code] || registry[0]; // fallback mandatory
}



//======================================
// FILE: tests.gs
//======================================

function myFunction() {
  const date = new Date();
  buildHourlyMetadataStrip(date);
}


//======================================
// FILE: Weather infographic.gs
//======================================

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

//======================================
// FILE: index.html
//======================================

<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>7 Day Weather Forecast</title>
<style>
  :root {
    --header-bg: #1f4e78;
    --radius: 8px;
  }
  html, body {
    background-color: transparent !important;
  }
  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 8px;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #f0f4f8;
  }

  .forecast-container {
    max-width: 900px;
    margin: auto;
    background-color: transparent !important;
    border-radius: var(--radius);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    overflow: hidden;
  }

  .header {
    background: var(--header-bg);
    color: #fff;
    text-align: center;
    padding: 12px;
  }

  /* MOBILE: Stack cards vertically */
  .daily-grid {
    display: flex;
    flex-direction: column; /* Vertical stack */
    gap: 8px;
    padding: 8px;
  }

  .day-card {
    position: relative;
    border-radius: var(--radius);
    overflow: hidden;
    min-height: 100px; /* Shorter for vertical list */
    color: #fff;
    font-weight: 600;
    display: flex;
  }

  /* DESKTOP: Switch to a single horizontal row */
  @media (min-width: 768px) {
    .daily-grid {
      flex-direction: row; /* Horizontal row */
      height: 180px; /* Fixed height for the row */
    }

    .day-card {
      flex: 1; /* Each card takes equal width (1/7th) */
      min-height: auto;
      flex-direction: column;
    }
  }

  .day-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 0;
  }

  .day-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(160, 160, 160, 0.15),
      rgba(160, 160, 160, 0.45)
    );
    z-index: 1;
  }

  .card-content {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
  }

  /* On mobile list, make content align horizontally for space */
  @media (max-width: 767px) {
    .card-content {
      flex-direction: row;
      justify-content: space-around;
      padding: 5px 15px;
    }
    .weather-icon { font-size: 2rem !important; }
  }

  .day-name { font-size: 1rem; }
  .weather-icon { font-size: 3rem; line-height: 1; padding: 3px;}
  .temp-range { font-size: 0.9rem; font-weight: bold; }
  .wind-info, .rain-mm, .uvIndex { font-size: 0.75rem; opacity: 0.9; line-height: 0.85; }
</style>


</head>
<body>
  <div class="forecast-container">
    <div class="header">
      <h2>7 Day Weather Forecast</h2>
    </div>
    <div class="daily-grid" role="list">
      <? data.forEach(function(row) { ?>
        <div class="day-card">
          <img class="day-bg" src="<?= row.bg ?>" alt="Weather Image">
          <div class="card-content">
            <div class="day-name"><?= row.day ?></div>
            <div class="weather-icon"><?= row.icon ?></div>
            <div class="temp-range">
              <span class="low" style="color: <?= row.minColor ?>;">
                <?= row.min ?>°
              </span> /
              <span class="high" style="color: <?= row.maxColor ?>;">
                <?= row.max ?>°
              </span>
            </div>
            <div class="wind-info"><?= row.wind ?></div>
            <div class="rain-mm"><?= row.rain ?></div>
            <div class="uvIndex">
              <span class="uvIndex" style="color: <?= row.uvColor ?>;">
                <?= row.uvIndex ?>
              </span>
            </div>
          </div>
        </div>
      <? }); ?>
    </div>
  </div>
</body>
</html>


//======================================
// FILE: Web Get.gs
//======================================

function doGet(e) {
  const params = (e && e.parameter) || {};
  
  // Logic to get the forecast data
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("WZ Daily Forecast");
  const values = sheet.getRange(2, 1, 7, 11).getValues();

  const forecastData = values.map(row => {
    const code = Math.round(row[1]);
    const min = Math.round(row[7]);
    const max = Math.round(row[8]);
    const uvIndex = Math.round(row[2]);

    return {
      day: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "EEEE"),
      icon: getEmoji(code),
      bg: getBackgroundImage(code), 
      min,
      max,
      minColor: getTempColor(min),
      maxColor: getTempColor(max),
      wind: row[5] + " " + getWindArrow(row[6]),
      rain: (row[3] || 0) + " mm",
      uvColor: getUVColor(uvIndex),
      uvIndex: "UV " + uvIndex
    };
  });

  // NEW: Handle JSON request for the website
  if (params.action === 'data') {
    return ContentService.createTextOutput(JSON.stringify({forecast: forecastData}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // DEFAULT: Keep the existing HTML display for direct viewing
  const template = HtmlService.createTemplateFromFile("index");
  template.data = forecastData;
  return template.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}





//======================================
// FILE: WZ Get Forecast.gs
//======================================

// //========================================
// 1. MAIN DAILY FUNCTION
// //========================================
function fetchWZDaily() {
  // Clear any daily retry triggers first
  deleteTriggersFor('retryDaily');

  const cfg = getWeatherConfig();
  var rawDate = new Date();
  
  // Check the day of the week (5 = Friday, 6 = Saturday)
  var currentDay = rawDate.getDay(); 
  var isFridayOrSaturday = (currentDay === 5 || currentDay === 6);

  var startDate = new Date();
  rawDate.setDate(rawDate.getDate() + 6);
  var endDate = rawDate;
  startDate = Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  endDate = Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var baseUrl = 'https://api.open-meteo.com/v1/forecast';
  var params = [
    'latitude=' + cfg.lat,
    'longitude=' + cfg.lon,
    'daily=weather_code,uv_index_max,precipitation_sum,wind_speed_10m_max,wind_speed_10m_mean,winddirection_10m_dominant,temperature_2m_min,temperature_2m_max',
    "timezone=auto",
    "start_date=" + startDate,
    "end_date=" + endDate,
    "wind_speed_unit=kn"
  ].join("&");

  var url = [baseUrl, params].join("?");

  try {
    const response = UrlFetchApp.fetch(url);
    const json = JSON.parse(response.getContentText());
    const daily = json.daily;
    if (daily.weather_code[0]) {
      storeWZDaily(daily);        
    }  
    
    Logger.log("Daily fetch successful.");

    // If it's Fri/Sat, trigger the Hourly process now
    if (isFridayOrSaturday) {
      Logger.log("It's Friday or Saturday. Initiating Hourly fetch...");
      fetchWZHourly();
    }

  } catch (e) {
    console.error(e);
    Logger.log("Error: Daily fetch failed. Rescheduling daily run.");
    createRetryTrigger('retryDaily', 30);
  }
}

// //========================================
// 2. MAIN HOURLY FUNCTION
// //========================================
function fetchWZHourly() {
  // Clear any hourly retry triggers first
  deleteTriggersFor('retryHourly');

  const cfg = getWeatherConfig();
  var rawDate = new Date();
  var startDate = new Date();
  
  startDate = Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  rawDate = new Date(startDate);
  rawDate.setDate(rawDate.getDate() + 1);
  var endDate = rawDate;
  endDate = Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  
  var baseUrl = 'https://api.open-meteo.com/v1/forecast';
  var params = [
    'latitude=' + cfg.lat,
    'longitude=' + cfg.lon,
    'hourly=temperature_2m,apparent_temperature,rain,wind_speed_10m,pressure_msl,wind_direction_10m,relative_humidity_2m,wet_bulb_temperature_2m,uv_index',
    "timezone=auto",
    "start_date=" + startDate,
    "end_date=" + endDate,
    "wind_speed_unit=kn" 
  ].join("&");

  var url = [baseUrl, params].join("?");

  try {
    const response = UrlFetchApp.fetch(url);
    const json = JSON.parse(response.getContentText());
    const hourly = json.hourly;
    if (hourly.time[0]) {
      storeWZHourly(json.hourly, "Forecast");
    }
    Logger.log("Hourly fetch successful.");
  } catch (e) {
    console.error(e);
    Logger.log("Error: Hourly fetch failed. Rescheduling hourly run.");
    createRetryTrigger('retryHourly', 30);
  }
}

// //========================================
// 3. TARGETED RETRY HANDLERS
// //========================================
function retryDaily() {
  Logger.log("Retry trigger fired for Daily data...");
  fetchWZDaily();
}

function retryHourly() {
  Logger.log("Retry trigger fired for Hourly data...");
  fetchWZHourly();
}

// //========================================
// 4. SMART TRIGGER UTILITIES
// //========================================
function createRetryTrigger(functionName, minutes) {
  // Clean up any existing triggers for this specific retry function first
  deleteTriggersFor(functionName);
  
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .after(minutes * 60 * 1000) 
    .create();
  Logger.log("Created a retry trigger for " + functionName + " in " + minutes + " minutes.");
}

function deleteTriggersFor(functionName) {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(triggers[i]);
      count++;
    }
  }
  if (count > 0) {
    Logger.log("Deleted " + count + " old trigger(s) for " + functionName);
  }
}

//======================================
// FILE: WZ Get Actual.gs
//======================================

function fetchWZHistoricalWeather() {
  const cfg = getWeatherConfig();
  // Date range (YYYY-MM-DD) - adjust as needed
  const dateObj = new Date();
  dateObj.setDate(dateObj.getDate() - 1);
  var startDate = dateObj;


  // JavaScript: getDay() → 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  if (dateObj.getDay() === 6) {  // It's a Saturday
    startDate = Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var endDate = startDate

    Logger.log(startDate);
    Logger.log(endDate);

    // Build the API URL manually (Apps Script compatible)
    const baseUrl =   'archive-api.open-meteo.com/v1/archive'
    var params = [
      'latitude=' + cfg.lat,
      'longitude=' + cfg.lon,
      'start_date=' + startDate,
      'end_date=' + endDate, 
      'hourly=temperature_2m,apparent_temperature,relative_humidity_2m,rain,wind_speed_10m,wind_direction_10m,pressure_msl,wet_bulb_temperature_2m,uv_index',
      "timezone=auto",
      "wind_speed_unit=kn"
      ].join("&");

    const url = [
      baseUrl,
      params
    ].join("?");

    //try {
      const response = UrlFetchApp.fetch(url);
      const json = JSON.parse(response.getContentText());
      
      if (!json.hourly) {
        console.log("No data returned. Check coordinates and dates.");
        return;
      }
      storeWZHourly(json.hourly, "Actual")
  }
    
  //} catch (e) {
  //  console.error(e);
  //}
}

//======================================
// FILE: WZ Store Hourly.gs
//======================================

function storeWZHourly(hourly, type) {
  Logger.log("Hourly: " + " Time: " + hourly.time[0] + " type: " + type);

  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);

  let sh;
  if (type === "Actual") {
    sh = ss.getSheetByName('WZ Actual Hourly Data') || ss.insertSheet('WZ Actual Hourly Data');
  } else {
    sh = ss.getSheetByName('WZ Hourly Data') || ss.insertSheet('WZ Hourly Data');
  }

  const startDate = new Date();
  sh.clearContents();

  // Headers
  const headers = [
    "DATE & TIME",
    "WIND(direction)",     
    "WIND(km/h)",
    "TEMP(°C)",
    "FEELS LIKE(°C)",
    "HUMIDITY(%)",
    "RAIN(mm)",
    "PRESSURE(hPa)",
    "Wet Temp",
    "UV Index"
  ];

  const rows = [headers];

  const numHours = hourly.time.length;

  // Build rows for the main sheet
  const dataRows = []; // We'll reuse these for archiving if needed
  for (let i = 0; i < numHours; i++) {
    const row = [
      hourly.time[i].replace("T", " "),               
      hourly.wind_direction_10m[i] || "",       
      hourly.wind_speed_10m[i] || "",
      hourly.temperature_2m[i] || "",
      hourly.apparent_temperature[i] || "",
      hourly.relative_humidity_2m[i] || "",
      hourly.rain[i] || "",
      hourly.pressure_msl[i] || "",
      hourly.wet_bulb_temperature_2m[i] || "",
      hourly.uv_index[i] || ""
    ];
    rows.push(row);
    dataRows.push(row);
  }

  // Write to the main sheet (clear entire sheet first)
  sh.clear();
  sh.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sh.autoResizeColumns(1, headers.length);

  // === ARCHIVING LOGIC: Only for Actual data on Saturdays ===
  if (type === "Actual" && numHours > 0) {
    // Get or create archive sheet
    let archiveSh = ss.getSheetByName('WZ Actual Hourly Archive');
    if (!archiveSh) {
      archiveSh = ss.insertSheet('WZ Actual Hourly Archive');
    }

    // Write headers only if sheet is currently empty
    if (archiveSh.getLastRow() === 0) {
      archiveSh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    // Append the data rows (without the header again)
    if (dataRows.length > 0) {
      // check to see if actuals for the day already stored.
      if(archiveSh.getRange(archiveSh.getLastRow(),1).getValue() === sh.getRange(rows.length, 1, 1, 1).getValue()) {
        Logger.log(`actuals already Archived`); 
      } else {
      const startRow = archiveSh.getLastRow() + 1;
      archiveSh.getRange(startRow, 1, dataRows.length, headers.length).setValues(dataRows);
      }
    }
    Logger.log(`Archived ${dataRows.length} Saturday hourly records.`);
  }

  Logger.log(`Success! Stored ${numHours} hourly records for ${startDate}.`);
}

//======================================
// FILE: WZ Store Daily.gs
//======================================

function storeWZDaily(daily) {
  Logger.log("In Daily");
  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  let sh = ss.getSheetByName('WZ Daily Forecast') || ss.insertSheet('WZ Daily Forecast');

  const headers = [
    'Date','weather_code','uv_index_max','precipitation_sum','wind_speed_10m_max','wind_speed_10m_mean','winddirection_10m_dominant','temperature_2m_min','temperature_2m_max'
  ];
  const rows = [headers];

  const numDays = daily.time.length;
  for (let i = 0; i < numDays; i++) {
    rows.push([
      daily.time[i] || "",
      daily.weather_code[i] || "",
      daily.uv_index_max[i] || "",
      daily.precipitation_sum[i] || "",
      daily.wind_speed_10m_max[i] || "",
      daily.wind_speed_10m_mean[i] || "",
      daily.winddirection_10m_dominant[i] || "",
      daily.temperature_2m_min[i] || "",
      daily.temperature_2m_max[i] || ""
    ]);
    Logger.log(rows[i]);
  };  
  
  // Clear sheet and write header + data
  sh.clearContents();
  sh.getRange(1,1,numDays+1,headers.length).setValues(rows);
  Logger.log(`Success! stored ${numDays} daily records for ${daily.time[0]}.`); 
}



//======================================
// FILE: WZ Store Current.gs
//======================================

function storeWZCurrent(c) {
  Logger.log("In current");

  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  let sh = ss.getSheetByName('WZ Current') || ss.insertSheet('WZ Current');
  
  sh.clearContents();

  var date = new Date();
    
  // 'current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
  // current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
  sh.appendRow([
    'Date',
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'precipitation',
    'weather_code',
    'cloud_cover',
    'wind_speed_10m',
    'wind_direction_10m',
    'uv_index'
  ]);

  sh.appendRow([
    c.time || "",                      // observation time
    c.temperature_2m|| "",
    c.apparent_temperature|| "",
    c.elative_humidity_2m|| "",
    c.precipitation|| "",
    c.weather_code|| "",
    c.cloud_cover|| "",
    c.wind_speed_10m|| "",
    c.wind_direction_10m|| "",
    c.uv_index||""
  ]);
  Logger.log(`Success! stored current data for ${date}.`); 
}



//======================================
// FILE: WZ Get Current.gs
//======================================

function fetchWZCurrent() {

  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  let sh = ss.getSheetByName('WZ Hourly Data') || ss.insertSheet('WZ Hourly Data');

  // Date range (YYYY-MM-DD) - adjust as needed
  var rawDate = new Date();
  var startDate = new Date();
  rawDate.setDate(rawDate.getDate() + 7);
  var endDate = rawDate;
  startDate = Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  baseUrl = "";
  params = "";
  url = "";

  // Build the API URL manually for the daily and current data
  var baseUrl =   'https://api.open-meteo.com/v1/forecast'
  var params = [
    'latitude=' + cfg.lat,
    'longitude=' + cfg.lon,
    'current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index',
    "timezone=auto",
    "start_date=" + startDate,
    "end_date=" + startDate 
    ].join("&");

  var url = [
    baseUrl,
    params
  ].join("?");

  Logger.log("url: " + url);

  try {
    const response = UrlFetchApp.fetch(url);
    const json = JSON.parse(response.getContentText());
    const current = json.current;  
    if(current.temperature_2m){    
      storeWZCurrent(current);
    }
  } catch (e) {
    console.error(e);
  }

}

