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