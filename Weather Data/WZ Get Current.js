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