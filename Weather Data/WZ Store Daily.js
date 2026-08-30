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

