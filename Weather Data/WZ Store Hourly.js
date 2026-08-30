function storeWZHourly(hourly, type) {
  Logger.log("Hourly: " + " Time: " + hourly.time[0] + " type: " + type);

  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);

  let sh;
  if (type === "Actual") {
    sh = ss.getSheetByName('WZ Actual Hourly Data') || ss.insertSheet('WZ Actual Hourly Data');
  } else {
    sh = ss.getSheetByName('WZ Hourly Data') || ss.insertSheet('WZ Hourly Data');
  }

  const startDate = new Date();
  sh.clearContents();

  // Headers
  const headers = [
    "DATE & TIME",
    "WIND(direction)",     
    "WIND(km/h)",
    "TEMP(°C)",
    "FEELS LIKE(°C)",
    "HUMIDITY(%)",
    "RAIN(mm)",
    "PRESSURE(hPa)",
    "Wet Temp",
    "UV Index"
  ];

  const rows = [headers];

  const numHours = hourly.time.length;

  // Build rows for the main sheet
  const dataRows = []; // We'll reuse these for archiving if needed
  for (let i = 0; i < numHours; i++) {
    const row = [
      hourly.time[i].replace("T", " "),               
      hourly.wind_direction_10m[i] || "",       
      hourly.wind_speed_10m[i] || "",
      hourly.temperature_2m[i] || "",
      hourly.apparent_temperature[i] || "",
      hourly.relative_humidity_2m[i] || "",
      hourly.rain[i] || "",
      hourly.pressure_msl[i] || "",
      hourly.wet_bulb_temperature_2m[i] || "",
      hourly.uv_index[i] || ""
    ];
    rows.push(row);
    dataRows.push(row);
  }

  // Write to the main sheet (clear entire sheet first)
  sh.clear();
  sh.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sh.autoResizeColumns(1, headers.length);

  // === ARCHIVING LOGIC: Only for Actual data on Saturdays ===
  if (type === "Actual" && numHours > 0) {
    // Get or create archive sheet
    let archiveSh = ss.getSheetByName('WZ Actual Hourly Archive');
    if (!archiveSh) {
      archiveSh = ss.insertSheet('WZ Actual Hourly Archive');
    }

    // Write headers only if sheet is currently empty
    if (archiveSh.getLastRow() === 0) {
      archiveSh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    // Append the data rows (without the header again)
    if (dataRows.length > 0) {
      // check to see if actuals for the day already stored.
      if(archiveSh.getRange(archiveSh.getLastRow(),1).getValue() === sh.getRange(rows.length, 1, 1, 1).getValue()) {
        Logger.log(`actuals already Archived`); 
      } else {
      const startRow = archiveSh.getLastRow() + 1;
      archiveSh.getRange(startRow, 1, dataRows.length, headers.length).setValues(dataRows);
      }
    }
    Logger.log(`Archived ${dataRows.length} Saturday hourly records.`);
  }

  Logger.log(`Success! Stored ${numHours} hourly records for ${startDate}.`);
}