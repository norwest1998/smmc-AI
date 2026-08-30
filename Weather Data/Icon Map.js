function resolveWeatherIcon(iconCode) {
  const map = {
    '01d':'☀️','01n':'🌙','02d':'🌤️','02n':'☁️',
    '03d':'☁️','03n':'☁️','04d':'☁️','04n':'☁️',
    '09d':'🌧️','09n':'🌧️','10d':'🌦️','10n':'🌧️',
    '11d':'⛈️','11n':'⛈️','13d':'❄️','13n':'❄️',
    '50d':'🌫️','50n':'🌫️'
  };
  return map[iconCode] || '🌤️';
}

function getWindArrowSvg(deg) {
  return `
  <svg width="40" height="40" viewBox="0 0 100 100"
       style="transform:rotate(${deg}deg)">
    <polygon points="50,5 65,60 50,50 35,60" fill="#333"/>
    <rect x="47" y="50" width="6" height="40" fill="#333"/>
  </svg>`;
}

/**
 * Returns the arrow based on degree value from Parameters sheet
 * @param {number} degree The input degree value
 * @return {string} The corresponding arrow or "No match"
 * @customfunction
 */
function getArrow(degree) {
  if (degree === "" || degree === null) return "";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const paramSheet = ss.getSheetByName("Parameters");
  
  if (!paramSheet) return "Sheet 'Parameters' not found";

  // Get data from columns L (12), M (13), O (15) – assuming headers in row 1, data from row 2
  const data = paramSheet.getRange("J2:M" + paramSheet.getLastRow()).getValues();

  for (let i = 0; i < data.length; i++) {
    const lower = data[i][0];   // Column L
    const upper = data[i][1];   // Column M
    const arrow = data[i][3];   // Column O (index 3 because L=0, M=1, N=2, O=3)

    // Skip empty rows
    if (lower === "" && upper === "" && arrow === "") continue;

    // Handle inclusive lower, inclusive upper (adjust as needed)
    if (degree >= lower && degree <= upper) {
      return arrow || "No arrow";
    }
  }

  return "Out of range";  // No matching range found
}

