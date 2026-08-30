function buildMenu() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Get Weather Data')
    .addItem('Refresh Daily', 'fetchWZDaily')
    .addSeparator()
    .addItem('Get History', 'fetchWZHistoricalWeather')
    .addSeparator()
    .addItem('Get Current Weather', 'fetchWZCurrent')
    .addToUi();
}

function getWeatherConfig() {
  return {
    apiKey: 'bd2c6defafaebe97b09000ce909a7594',
    lat: -33.7312,       // example: Sydney
    lon: 150.9629,
    units: 'metric',
    spreadsheetId: '1EYuf5wi4Gw-4WP1hdg9sZsOO9tbRx_Z-q5go8BBEOGc',
    weatherFolderID: '1eJI3ky3bcn4FhBXu0tzneYvdyWJ4Ih98',
    sheetName: 'Forecast_3H'
  };
}


