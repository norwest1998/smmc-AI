function myFunction() {
  const date = new Date();
  buildHourlyMetadataStrip(date);
}

function testWebUrl() {
  var mockEvent = {
    parameter: { action: "data" }
  };
  
  // Call the function
  const res = doGet(mockEvent); 
  
  // In Apps Script, 'res' is a TextOutput object, not a fetch response
  const jsonString = res.getContent(); 
  const data = JSON.parse(jsonString);
  
  Logger.log("Parsed Data: " + JSON.stringify(data, null, 2));

  const forecast = data.forecast;
  if (forecast && forecast.length > 0) {
    const today = forecast[0];
    Logger.log("SUCCESS! Today is: " + today.day);
    Logger.log("Today Max Temp: " + today.max);
    Logger.log("Today Wind: " + today.wind);
  }
}
