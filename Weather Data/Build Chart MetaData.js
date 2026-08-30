function buildHourlyMetadataStrip(targetDate) {
  const cfg = getWeatherConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  if(!targetDate) targetDate = new Date();

  const src = ss.getSheetByName('Forecast_Hourly');
  const dash = ss.getSheetByName('Dashboard');

  if (!src || !dash) {
    throw new Error('Required sheet missing');
  }

  const tz = Session.getScriptTimeZone();
  const dayKey = Utilities.formatDate(targetDate, tz, 'yyyy-MM-dd');

  const data = src.getDataRange().getValues();
  data.shift(); // headers

  // Filter rows for target day
  const hours = data
    .map(r => {
      const dt = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
      const arrow = getArrow(r[7])
      return {
        dt,
        time: Utilities.formatDate(dt, tz, 'HH:mm'),
        icon: resolveWeatherIcon(r[14]),
        desc: r[13],
        wind: r[6] + " " + arrow
      };
    })
    .filter(h =>
      Utilities.formatDate(h.dt, tz, 'yyyy-MM-dd') === dayKey
    );

  if (!hours.length) return;

  // Clear previous strip
  dash.getRange('B20:ZZ23').clearContent();

  // Write rows
  dash.getRange(20, 2, 1, hours.length)
    .setValues([hours.map(h => h.time)]);

  dash.getRange(21, 2, 1, hours.length)
    .setValues([hours.map(h => h.icon)]);

  dash.getRange(22, 2, 1, hours.length)
    .setValues([hours.map(h => h.desc)]);

  dash.getRange(23, 2, 1, hours.length)
    .setValues([hours.map(h => h.wind)]);
}
