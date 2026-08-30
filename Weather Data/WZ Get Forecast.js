// ==========================================
// 1. MAIN DAILY FUNCTION
// ==========================================
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

// ==========================================
// 2. MAIN HOURLY FUNCTION
// ==========================================
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

// ==========================================
// 3. TARGETED RETRY HANDLERS
// ==========================================
function retryDaily() {
  Logger.log("Retry trigger fired for Daily data...");
  fetchWZDaily();
}

function retryHourly() {
  Logger.log("Retry trigger fired for Hourly data...");
  fetchWZHourly();
}

// ==========================================
// 4. SMART TRIGGER UTILITIES
// ==========================================
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