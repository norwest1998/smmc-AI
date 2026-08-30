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