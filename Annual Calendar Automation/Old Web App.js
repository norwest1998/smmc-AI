function oldDoGet(e) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Web doGet Datasheet');

  const title = sheet.getRange('A1').getDisplayValue() || 'Race Day';
  const raceInfo = sheet.getRange('B2').getValue();

  let cardsHtml = ''; 

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

    return HtmlService.createHtmlOutput(renderPage(title, cardsHtml))
      .setTitle(title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }


  // =========================
  // LOAD RACE DATA
  // =========================
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return HtmlService.createHtmlOutput(renderPage(title, '<p>No race data found</p>'));
  }

  const raceData = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  // =========================
  // WEATHER DATA
  // =========================
  const props = PropertiesService.getScriptProperties();
  const weatherSSId = props.getProperty('WZHourlyID');
  if (!weatherSSId) {
    return HtmlService.createHtmlOutput(renderPage(title, '<p>Weather spreadsheet ID not set</p>'));
  }

  const weatherSS = SpreadsheetApp.openById(weatherSSId);
  const weatherSheet = weatherSS.getSheetByName('WZ Hourly Data');
  if (!weatherSheet) {
    return HtmlService.createHtmlOutput(renderPage(title, '<p>Weather sheet not found</p>'));
  }

  const weatherData = weatherSheet.getDataRange().getValues();

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

    let weatherRow = '<div class="no-data">No hourly weather data available</div>';

    // --- OPTIONAL: WEATHER LOOP (unchanged logic) ---
    let hourlyHtml = '';
    for (let i = 1; i < weatherData.length; i++) {
      const w = weatherData[i];
      if (!(w[0] instanceof Date)) continue;

      const weatherTime = w[0];
      // Only include hours during the race
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
  return HtmlService.createHtmlOutput(renderPage(title, cardsHtml))
    .setTitle(title)
    // This line is non-negotiable for mobile resizing
    .addMetaTag('viewport', 'width=device-width, initial-scale=1') 
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}