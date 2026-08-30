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

