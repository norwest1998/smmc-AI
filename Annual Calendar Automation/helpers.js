function getWindScale(wind){
  temp = parseFloat(wind);  // Ensure it's a number
  if (wind > 47.52) return 'Storm';  
  if (wind > 39.96) return 'Strong Gale';  
  if (wind > 32.94) return 'Gale';  
  if (wind > 26.46) return 'Near Gale';   
  if (wind > 20.52) return 'Strong Breeze';
  if (wind > 15.12) return 'Fresh Breeze';  
  if (wind > 10.26) return 'Moderate Breeze';  
  if (wind > 5.94) return 'Gentle Breeze';   
  if (wind > 2.70) return 'Light Breeze';  
  if (wind > 0.53) return 'Light Air'; 
  return 'Calm';
}

// ============================================================
// HELPER FUNCTIONS
// Add these outside doGet(), at the module level.
// ============================================================
 
/**
 * Reads the Classes sheet from the SMMC Club Management spreadsheet
 * and returns a map of { ClassName -> Drive thumbnail URL }.
 *
 * Classes sheet columns (0-based):
 *   0=ClassID  1=ClassName  2=Coordinator  3=Restrictions  4=Handicap  5=Insignia (Drive FileID)
 *
 * Store the Club Management spreadsheet ID in Script Properties
 * under the key 'ClubManagementSSID'.
 */
function getClassImageMap_() {
  const imageMap = {};
 
  try {
    const props  = PropertiesService.getScriptProperties();
    const ssId   = props.getProperty('ClubManagementSSID');
    if (!ssId) {
      Logger.log('ClubManagementSSID not set in Script Properties');
      return imageMap;
    }
 
    const clubSS     = SpreadsheetApp.openById(ssId);
    const classSheet = clubSS.getSheetByName('Classes');
    if (!classSheet) {
      Logger.log('Classes sheet not found in Club Management spreadsheet');
      return imageMap;
    }
 
    const data = classSheet.getDataRange().getValues();
 
    for (let r = 1; r < data.length; r++) {
      const row       = data[r];
      const className = String(row[1]).trim();   // Col B  ClassName
      const fileId    = String(row[5]).trim();   // Col F  Insignia (Drive FileID)
 
      if (!className || !fileId || fileId === 'undefined') continue;
 
      // Drive thumbnail URL — sz=s128 gives 128px; adjust as needed (s64, s256, etc.)
      imageMap[className] = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=s128';
    }
  } catch (err) {
    Logger.log('getClassImageMap_ error: ' + err.message);
  }
 
  return imageMap;
}
 
/**
 * Builds a map of { hexKey -> roundNumber } by counting regattas
 * of the same Season + Class + RegattaType in date order.
 *
 * Col indices (0-based):
 *   0=HexKey  2=Date  6=Class  7=RegattaType  10=Season
 */
function buildRoundNumberMap_(data) {
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const row  = data[r];
    const date = row[2] instanceof Date ? row[2] : new Date(row[2]);
    if (isNaN(date) || !row[0]) continue;
    rows.push({
      hexKey:      row[0],
      date:        date,
      boatClass:   row[6],   // Col G
      regattaType: row[7],   // Col H
      season:      row[10] || deriveSeason_(date)  // Col K
    });
  }
 
  rows.sort((a, b) => a.date - b.date);
 
  const counters = {};
  const roundMap = {};
 
  rows.forEach(ev => {
    if (!ev.boatClass || !ev.regattaType) return;
    // Key on Season + Class + RegattaType so DF95 Scratch and DF95 Handicap
    // each get their own independent round count
    const groupKey = ev.season + '|' + ev.boatClass + '|' + ev.regattaType;
    counters[groupKey] = (counters[groupKey] || 0) + 1;
    roundMap[ev.hexKey] = counters[groupKey];
  });
 
  return roundMap;
}

/**
 * Formats a Date object or "HH:MM" string to "HH:MM".
 */
function formatTime_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(val).trim();
}
 
/**
 * Returns a short uppercase date string like "22 AUG".
 */
function formatShortDate_(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN',
                'JUL','AUG','SEP','OCT','NOV','DEC'][date.getMonth()];
  return day + ' ' + mon;
}

/**
 * Derives a season string from an event date.
 * Season starts in July: Aug 2026 -> "2026-27", Feb 2027 -> "2026-27".
 */
function deriveSeason_(date) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based
  if (m >= 6) {
    return y + '-' + String(y + 1).slice(-2);
  } else {
    return (y - 1) + '-' + String(y).slice(-2);
  }
}

/* =====================================================
   SINGLE HTML SHELL (NO DUPLICATION)
   ===================================================== */
function renderPage(title, bodyContent) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>

  <style>
    :root {
      --header-bg: #1f4e78;
      --radius: 8px;
      --glass-fill: rgba(160,160,160,0.15);
      --glass-fill-hi: rgba(160,160,160,0.45);
      --glass-border: rgba(255,255,255,0.3);
      --glass-blur: 12px;
      --foam: #ffffff;
      --foam-dim: rgba(255,255,255,0.75);
      --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      --font-data: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }

    /* 1. RESET & BOX MODEL - Prevents internal scrollbars */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      height: auto;
      width: 100%;
      /* This is the secret to killing the vertical scrollbar inside the iframe */
      overflow-x: hidden !important; 
      overflow-y: auto;
      background-color: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }

    /* 2. WRAPPER - This is the element the script measures */
    #content-measure {
      width: 100%;
      margin: 0;
      padding: 10px 15px 30px 15px; /* Bottom padding for card shadows */
      display: flow-root; /* Prevents margin collapse from shrinking the height */
    }

    /* 3. HEADINGS */
    h1 {
      text-align: center;
      margin: 0;
      padding: 15px 0;
      font-size: 1.8em;
      color: #ffffff;
    }
    h2 {
      text-align: center;
      margin: 0;
      padding: 10px 0;
      font-size: 1.3em;
      color: #ffffff;
    }

    .header {
    background: var(--header-bg);
    color: #fff;
    text-align: center;
    padding: 12px;
  }

    /* 4. CONTAINER (Mobile First) */
    .cards-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      width: 100%;
    }

    /* 5. DESKTOP LAYOUT (Breakpoints) */
    @media (min-width: 768px) {
      .cards-container {
        flex-direction: row;
        justify-content: center;
        flex-wrap: wrap;
        height: auto;
      }
    }

    /* 6. RACE CARD STYLES */
    .race-card {
      position: relative;
      width: 100%;
      max-width: 420px;
      background: linear-gradient(
        to bottom,
        rgba(160, 160, 160, 0.15),
        rgba(160, 160, 160, 0.45)
        );
      border-radius: 16px;
      padding: 15px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      text-align: center;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .race-card.no-events {
      min-height: 220px;
      display: flex;
      flex-direction: column; /* Ensure vertical stacking */
      justify-content: center;
      align-items: center;
      padding: 15px;
      overflow: visible; /* Ensure nothing is hidden from measurement */
      background: linear-gradient(
        to bottom,
        rgba(160, 160, 160, 0.15),
        rgba(160, 160, 160, 0.45)
        );
      }

    .race-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }

    .race-card::before {
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
      color: #fff;
    }

    .race-time {
      font-size: 1.4em;
      font-weight: bold;
      color: #ffd700;
      margin-bottom: 15px;
    }

    /* 7. WEATHER ROW */
    .weather-cards-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      width: 100%;
    }

    .weather-mini-card {
      background: rgba(192, 192, 192, 0.1);
      backdrop-filter: blur(6px);
      color: #fff;
      border-radius: 5px;
      padding: 8px;
      flex: 0 0 80px;
      max-width: 110px;
      font-size: 14px;
    }

    .time {
      font-size: 0.75em;
      opacity: 0.85;
      color: #ffffff;
    }

    .temp {
      font-size: 1.4em;
      font-weight: 600;
    }

    .wind,
    .rain,
    .uvRow {
      font-size: 1em;
      opacity: 0.85;
    }
    .uvVal {font-size: 1em; font-weight: 600;}

    .weather-panel--daily{
      display:flex;
      flex-direction:column;
      gap:8px;
      padding:8px 12px;
      margin-top:8px;
      border-radius:8px;
      background:linear-gradient(155deg, var(--glass-fill-hi), var(--glass-fill));
      border:1px solid var(--glass-border);
      backdrop-filter:blur(var(--glass-blur)) saturate(140%);
      -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(140%);
      box-shadow:
        0 1px 0 rgba(255,255,255,0.2) inset,
        0 12px 28px rgba(2,10,18,0.3);
      position:relative;
    }
    .weather-panel--daily::after{
      content:"";
      position:absolute; inset:0;
      border-radius:inherit;
      background:linear-gradient(120deg, rgba(255,255,255,0.12) 0%, transparent 30%);
      pointer-events:none;
    }
    .daily-row--summary{
      display:flex;
      align-items:center;
      gap:8px;
      justify-content:center;
    }
    .daily-icon{ font-size:34px; line-height:1; flex:none; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25)); }
    .daily-desc{ font-family:var(--font-body); font-size:13.5px; font-weight:600; color:var(--foam); }
    .daily-temps{ font-family:var(--font-data); font-size:20px; display:flex; align-items:baseline; gap:4px; margin-left:auto; }
    .daily-temps .temp-max{ font-weight:500; }
    .daily-temps .temp-min{ font-size:13px; color:var(--foam-dim); }
    
    .weather-daily-card{
      display:flex;
      align-items:center;
      gap:8px;
      padding:8px 12px;
      margin-top:8px;
      border-radius:8px;
      background:linear-gradient(155deg, var(--glass-fill-hi), var(--glass-fill));
      border:1px solid var(--glass-border);
      backdrop-filter:blur(var(--glass-blur)) saturate(140%);
      -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(140%);
      box-shadow:
        0 1px 0 rgba(255,255,255,0.2) inset,
        0 12px 28px rgba(2,10,18,0.3);
      position:relative;
      flex-wrap:wrap;
    }
    .weather-daily-card::after{
      content:"";
      position:absolute; inset:0;
      border-radius:inherit;
      background:linear-gradient(120deg, rgba(255,255,255,0.12) 0%, transparent 30%);
      pointer-events:none;
    }
    .daily-icon{
      font-size:34px;
      line-height:1;
      flex:none;
      filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25));
    }
    .daily-desc{
      font-family:var(--font-body);
      font-size:13.5px;
      font-weight:600;
      color:var(--foam);
      flex:1 1 120px;
      min-width:100px;
    }
    .daily-temps{
      font-family:var(--font-data);
      font-size:20px;
      flex:none;
      display:flex;
      align-items:baseline;
      gap:4px;
    }
    .daily-temps .temp-max{ font-weight:500; }
    .daily-temps .temp-min{
      font-size:13px;
      color:var(--foam-dim);
    }
    .daily-row{
      width:100%;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      font-family:var(--font-data);
      font-size:13px;
      color:var(--foam-dim);
      letter-spacing:0.02em;
      padding-top:4px;
    }
    .daily-row .wind{ color:var(--foam-dim); }
    .daily-row .rain{ color:var(--foam-dim); }
    .daily-row .uvVal{ font-weight:500; }

  </style>
</head>

<body>
  <div id="content-measure">

    <h2>${title}</h2>

    <div class="cards-container">
      ${bodyContent}
    </div>

  </div>
</body>
</html>
`;
}


function getTempColor(temp) {
  temp = parseFloat(temp);

  if (temp > 35) return '#f20c0c';      // Red
  if (temp > 31) return '#b96200';      // Orange
  if (temp > 28) return '#8c7400';      // Yellow
  if (temp > 22) return '#4dff88';      // Green
  if (temp > 18) return '#008057';      // Teal
  if (temp > 13) return '#00747a';      // Cyan (aqua)
  if (temp > 10) return '#03d9f3';      // Sky blue
  if (temp > 5)  return '#0091d9';      // Aqua blue  ← was #2705fa (indigo/violet)
  return '#00539c';                     // Deep blue  ← was #00008b (near-black, breaks the gradient feel)
}

function getUVColor(index) {
  temp = parseFloat(index);  // Ensure it's a number
  if (index > 10) return '#5900b3';  // Purple
  if (index > 8) return '#ff3300';   // Red
  if (index > 5) return '#ff6600';   // Dark Orange
  if (index > 2) return '#e6b800';   // Light Orange  
  return '88cc00';                   // Green 
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
 * Maps Open-Meteo style WMO weather codes to a short label + emoji icon.
 * Extend this list if your data source uses codes not listed here.
 */
function getWeatherDescription(code) {
  const map = {
    0:  { label: 'Clear sky',            icon: '☀️' },
    1:  { label: 'Mainly clear',         icon: '🌤️' },
    2:  { label: 'Partly cloudy',        icon: '⛅' },
    3:  { label: 'Overcast',             icon: '☁️' },
    45: { label: 'Fog',                  icon: '🌫️' },
    48: { label: 'Depositing rime fog',  icon: '🌫️' },
    51: { label: 'Light drizzle',        icon: '🌦️' },
    53: { label: 'Drizzle',              icon: '🌦️' },
    55: { label: 'Dense drizzle',        icon: '🌧️' },
    61: { label: 'Slight rain',          icon: '🌧️' },
    63: { label: 'Rain',                 icon: '🌧️' },
    65: { label: 'Heavy rain',           icon: '🌧️' },
    71: { label: 'Slight snow',          icon: '🌨️' },
    80: { label: 'Rain showers',         icon: '🌦️' },
    95: { label: 'Thunderstorm',         icon: '⛈️' }
  };

  return map[code] || { label: 'Forecast', icon: '🌡️' };
}

function sheetToObjects(ss, sheetName, keys) {
  try {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    const results = [];
    for (let r=1;r<data.length;r++) {
      const row = data[r];
      const obj = {};
      for (let i=0;i<keys.length;i++) obj[keys[i]] = row[i] !== undefined ? (row[i]===''? null: row[i]) : null;
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error: ' + e);
    return [];
  }
}

// date object
function createDateObject(input){
  // Split date and time
  const [datePart, timePart] = input.trim().split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Create Date object (month is 0-based)
  const dateObj = new Date(year, month - 1, day, hour, minute);
  return dateObj
}

// Regional Conflicts Checker for Sailing Club Calendar
// Checks Radio Sailing Australia website for conflicting events

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Tools')
    .addItem('Check Regional Conflicts', 'checkRegionalConflicts')
    .addItem('Add to Google Calendar', 'addToGoogleCalendar')
    .addItem('Update Upcoming Calendar', 'updateUpcoming')
    .addItem('Create New Season Schedule', 'newSeason')
    .addToUi();
}

function newSeason(){
  SEASONFIXTUREGENERATOR.generateSeasonFixtures();
}

function setupMonthlyTriggers() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Create triggers for 1st and 15th of each month at 6 AM
  ScriptApp.newTrigger('checkRegionalConflicts')
    .timeBased()
    .onMonthDay(1)
    .atHour(6)
    .create();
    
  ScriptApp.newTrigger('checkRegionalConflicts')
    .timeBased()
    .onMonthDay(15)
    .atHour(6)
    .create();
    
  SpreadsheetApp.getUi().alert('Monthly triggers set for 1st and 15th of each month at 6 AM');
}

function getArrow(dir) {
  if (isNaN(dir) || dir === '') return '';
  dir = parseFloat(dir) % 360;
  const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
  const index = Math.round(dir / 45) % 8;
  return arrows[index];
}


// Helper: consistent fallback image
function getFallbackImage() {
  return 'https://images.unsplash.com/photo-1601134467661-3d775b999c8b?ixlib=rb-4.0.3&auto=format&fit=crop&q=80'; // clear sky
}

function loadBackgroundRegistry() {
  const spreadsheetId = WEATHER_SS_ID;
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sh = ss.getSheetByName(IMAGE_REGISTRY_SHEET);
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

/**
 * Finds the row in "WZ Daily Forecast" matching raceDate and returns a
 * rendered summary card, or null if no matching row / sheet is found.
 *
 * Expected columns (row[0]..row[8]):
 *   Date, weather_code, uv_index_max, precipitation_sum,
 *   wind_speed_10m_max, wind_speed_10m_mean, winddirection_10m_dominant,
 *   temperature_2m_min, temperature_2m_max
 */
function buildDailySummaryHtml(dailyData, raceDate) {
  if (!dailyData || dailyData.length < 2) return null;

  const targetY = raceDate.getFullYear();
  const targetM = raceDate.getMonth();
  const targetD = raceDate.getDate();

  for (let i = 1; i < dailyData.length; i++) {
    const row = dailyData[i];
    const rowDate = row[0];
    if (!(rowDate instanceof Date)) continue;

    const sameDay =
      rowDate.getFullYear() === targetY &&
      rowDate.getMonth() === targetM &&
      rowDate.getDate() === targetD;

    if (!sameDay) continue;

    const weatherCode   = row[1];
    const uvMax          = row[2] !== '' ? Math.round(row[2]) : null;
    const rainSum        = row[3] || 0;
    const windMax        = row[4];
    const windMean       = row[5];
    const windDir        = row[6];
    const windScl        = getWindScale(row[5])
    const tempMin        = Math.round(row[7]);
    const tempMax        = Math.round(row[8]);

    const desc = getWeatherDescription(weatherCode);
    const uvColor = uvMax !== null ? getUVColor(uvMax) : '#999';
    const maxTempColor = getTempColor(tempMax);
    const minTempColor = getTempColor(tempMin);
    const windArrow = getWindArrow(windDir);

    return `
      <div class="weather-panel weather-panel--daily">
        <div class="daily-row--summary">
          <span class="daily-icon">${desc.icon}</span>
          <span class="daily-desc">${desc.label}</span>
          <span class="daily-temps">
            <span class="temp-min" style="color:${minTempColor};">${tempMin}°</span> /
            <span class="temp-max" style="color:${maxTempColor};">${tempMax}°</span>
          </span>
        </div>
        <div class="daily-row">
          <span class="wind">Wind ${windMean}–${windMax} kt ${windArrow} ${windScl}</span>
        </div>
        <div class="daily-row">
          <span class="rain"> Rain ${rainSum} mm</span>
          <span class="uvVal" style="color:${uvColor};">${uvMax !== null ? 'UV ' + uvMax : ''}</span>
        </div>
      </div>
    `;
  }

  return null; // no matching date found in the forecast sheet
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Injects a CSS string into an already-built HTML page.
 * Wraps the CSS in <style> tags and inserts it just before </head>
 */
function injectStyle(html, css) {
  const styleTag = `<style>${css}</style>`;
  if (html.indexOf('</head>') !== -1) {
    return html.replace('</head>', styleTag + '</head>');
  }
  return styleTag + html;
}
