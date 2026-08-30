// =========================================================
// DAILY FORECAST CARD CSS
// Same tokens as the rest of the site (--glass-fill, --foam, etc).
// Kept as a standalone constant so it's easy to find/edit, and so it
// can be injected into the HTML output regardless of how renderPage()
// builds its <head>.
// =========================================================



function doGet(e) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Web doGet Datasheet');
  const data = sheet.getDataRange().getValues();

  const title = sheet.getRange('A1').getDisplayValue() || 'Race Day';
  const raceInfo = sheet.getRange('B2').getValue();

  let cardsHtml = ''; 

  if(e.parameter.type === "display") {
    // =========================
    // NO EVENTS CASE
    // =========================
    if (raceInfo === "No Events scheduled for the weekend") {
      cardsHtml = `
        <div class="race-card no-events">
          <img class="race-bg" src="${DEFAULT_BG_IMAGE}" alt="">
          <div class="card-content">
            <div class="heading">
              <h2>${raceInfo}</h2>
            </div>
          </div>
        </div>
      `;

      return HtmlService.createHtmlOutput(injectStyle(renderPage(title, cardsHtml)))
        .setTitle(title)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    }
  }

  // =========================
  // LOAD RACE DATA
  // =========================
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, '<p>No race data found</p>')));
  }

  const raceData = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  // =========================
  // WEATHER DATA (HOURLY)
  // =========================
  const props = PropertiesService.getScriptProperties();
  const weatherSSId = props.getProperty('WZHourlyID');
  if (!weatherSSId) {
    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, '<p>Weather spreadsheet ID not set</p>')));
  }

  const weatherSS = SpreadsheetApp.openById(weatherSSId);
  const weatherSheet = weatherSS.getSheetByName('WZ Hourly Data');
  if (!weatherSheet) {
    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, '<p>Weather sheet not found</p>')));
  }

  const weatherData = weatherSheet.getDataRange().getValues();

  // =========================
  // WEATHER DATA (DAILY FORECAST) — used as fallback
  // =========================
  const dailySheet = weatherSS.getSheetByName('WZ Daily Forecast');
  const dailyData = dailySheet ? dailySheet.getDataRange().getValues() : [];

  if (e.parameter.type === "data") {
        const date = data[0][0];
        const events = [];
        for (let i = 1; i < data.length; i++) {
          var event = data[i];
          events.push({
            date: date, 
            name: event[0],
            start: event[1],
            end: event[2],
            eventClass: event[3],
            eventFormat: event[5]
          });
        }
        const payload = { events: events, weatherData: weatherData };
        return ContentService.createTextOutput(JSON.stringify(payload))
          .setMimeType(ContentService.MimeType.JSON);
  } else {

    // =========================
    // BUILD RACE CARDS (LOOP)
    // =========================

    raceData.forEach(row => {

      const regattaName = row[0];
      if (!regattaName) return;

      const startTime = row[1];
      const endTime = row[2];

      const startDisplay = Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'HH:mm');
      const endDisplay   = Utilities.formatDate(endTime, Session.getScriptTimeZone(), 'HH:mm');

      const raceDate = new Date(title); // Saturday
      Logger.log("Race day: " + raceDate);
      const bgImage = getWeatherPic(raceDate);

      let weatherRow = '';

      // --- HOURLY WEATHER LOOP (unchanged logic) ---
      let hourlyHtml = '';
      for (let i = 1; i < weatherData.length; i++) {
        const w = weatherData[i];
        if (!(w[0] instanceof Date)) continue;

        const weatherTime = w[0];
        if (weatherTime < startTime || weatherTime > endTime) continue;
        var wind = w[2] + getWindArrow(w[1]);
        var temp = Math.round(w[3]);
        var uvIdx = Math.round(w[9]);
        var uvColor = getUVColor(uvIdx);
        var tempColor = getTempColor(temp);

        const time = Utilities.formatDate(w[0], Session.getScriptTimeZone(), 'HH:mm');
        hourlyHtml += `
          <div class="weather-mini-card">
            <div class="time">${time}</div>
            <div class="temp">
              <span class="temp" style="color: ${tempColor};">
                ${temp}°
              </span>
            </div>
            <div class="wind">${wind}</div>
            <div class="rain">${(w[6] || 0)} mm</div>
            <div class="uvRow">
              <span class="uvVal" style="color: ${uvColor};">
                UV ${uvIdx}
              </span>
            </div>
          </div>
        `;
      }

      if (hourlyHtml) {
        weatherRow = `<div class="weather-cards-row">${hourlyHtml}</div>`;
      } else {
        const dailySummary = buildDailySummaryHtml(dailyData, raceDate);
        weatherRow = dailySummary ||
          '<div class="no-data">No weather data available</div>';
      }

      // --- CARD HTML ---
      cardsHtml += `
        <div class="race-card">
          <img class="race-bg" src="${bgImage}" alt="">
          <div class="card-content">
            <div class="heading">
              <h2>${regattaName}</h2>
            </div>
            <div class="race-time">${startDisplay} – ${endDisplay}</div>
            ${weatherRow}
          </div>
        </div>
      `;

    });

    // =========================
    // FINAL RENDER
    // =========================
    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, cardsHtml)))
      .setTitle(title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1') 
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}


/**
 * Injects a CSS string into an already-built HTML page.
 * Wraps the CSS in <style> tags and inserts it just before </head> if
 * one exists; otherwise prepends it to the document. This means it works
 * no matter how renderPage() assembles its own <style> block — you don't
 * need to edit renderPage() at all.
 */
function injectStyle(html, css) {
  const styleTag = `<style>${css}</style>`;
  if (html.indexOf('</head>') !== -1) {
    return html.replace('</head>', styleTag + '</head>');
  }
  return styleTag + html;
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
    const tempMin        = Math.round(row[7]);
    const tempMax        = Math.round(row[8]);

    const desc = getWeatherDescription(weatherCode);
    const uvColor = uvMax !== null ? getUVColor(uvMax) : '#999';
    const maxTempColor = getTempColor(tempMax);
    const minTempColor = getTempColor(tempMin);
    const windArrow = getWindArrow(windDir);

    return `
      <div class="weather-daily-card">
        <div class="daily-icon">${desc.icon}</div>
        <div class="daily-desc">${desc.label}</div>
        <div class="daily-temps">
          <span class="temp-min" style="color:${minTempColor};">${tempMin}°
          </span> /
          <span class="temp-max" style="color:${maxTempColor};"> ${tempMax}°</span>
        </div>
        <div class="daily-row">
          <span class="wind">Wind ${windMean}–${windMax} kt ${windArrow}</span>
        </div>
        <div class="daily-row">
          <span class="rain"> Rain ${rainSum} mm</span>
          <span class="uvVal" style="color:${uvColor};">
            ${uvMax !== null ? 'UV ' + uvMax : ''}
          </span>
        </div>
      </div>
    `;
  }

  return null; // no matching date found in the forecast sheet
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