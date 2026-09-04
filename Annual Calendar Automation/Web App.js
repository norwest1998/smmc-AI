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
  
  const type = e.parameter.type;
  const action = e.parameter.action;
  const sheetName = e.parameter.sheet;

  const title = sheet.getRange('A1').getDisplayValue() || 'Race Day';
  const raceInfo = sheet.getRange('B2').getValue();

  let cardsHtml = ''; 

  if(type === "display") {
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

  if (action === "fetch") {
    const sheet = ss.getSheetByName(sheetName);
    const values = sheet.getDataRange().getValues();
    return json({ values });
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



function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.sheet);

  if (body.action === "update") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const hexCol = headers.indexOf("HexKey") + 1;
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(r => r[hexCol - 1] === body.hexKey);
    if (rowIndex === -1) return json({ error: "HexKey not found" }, 404);

    Object.entries(body.updates).forEach(([field, value]) => {
      const col = headers.indexOf(field) + 1;
      if (col > 0) sheet.getRange(rowIndex + 1, col).setValue(value);
    });
    return json({ success: true });
  }

  if (body.action === "append") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(h => body.rowData[h] ?? "");
    sheet.appendRow(row);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
}

