function doGet(e) {
  const params = (e && e.parameter) || {};
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName("WZ Daily Forecast");

  if (!sheet) {
    const errPayload = JSON.stringify({error: "Sheet 'WZ Daily Forecast' not found"});
    return respond(errPayload, params.callback);
  }

  const values = sheet.getRange(2, 1, 7, 9).getValues();
  const forecastData = values.map(row => {
    const code = Math.round(row[1]);
    const min = Math.round(row[7]);
    const max = Math.round(row[8]);
    const uvIndex = Math.round(row[2]);

    return {
      day: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "EEEE"),
      icon: getEmoji(code),
      bg: getBackgroundImage(code),
      min,
      max,
      minColor: getTempColor(min),
      maxColor: getTempColor(max),
      wind: row[4] + " " + getWindArrow(row[6]),
      rain: (row[3] || 0) + " mm",
      uvColor: getUVColor(uvIndex),
      uvIndex: "UV " + uvIndex
    };
  });

  if (params.action === 'data') {
    return respond(JSON.stringify({forecast: forecastData}), params.callback);
  }

  const template = HtmlService.createTemplateFromFile("index");
  template.data = forecastData;
  return template.evaluate()
    .setTitle("Weather Forecast")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function respond(jsonString, callback) {
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${jsonString})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}