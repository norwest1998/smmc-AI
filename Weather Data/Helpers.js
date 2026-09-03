



function getEmoji(main) {
  const map = { 
    '0': '☀️',
    '1': '🌤️',
    '2': '⛅',
    '3': '☁️',
    '45': '☁️',
    '51': '🌦️',
    '53': '🌦️',
    '55': '🌦️',
    '56': '🌧️',
    '57': '🌧️',
    '61': '🌧️',
    '63': '🌧️',
    '65': '🌧️',
    '80': '🌧️',
    '81': '🌧️',
    '82': '🌧️',
    '95': '⛈️',
    '96': '⛈️',
    '99': '⛈️' 
  };
  return map[main] || '🌡️';
}

function getWindArrow(deg) {
  if (deg > 337.5 || deg <= 22.5) return "⬇️";
  if (deg > 22.5 && deg <= 67.5) return "↙️";
  if (deg > 67.5 && deg <= 112.5) return "⬅️";
  if (deg > 112.5 && deg <= 157.5) return "↖️";
  if (deg > 157.5 && deg <= 202.5) return "⬆️";
  if (deg > 202.5 && deg <= 247.5) return "↗️";
  if (deg > 247.5 && deg <= 292.5) return "➡️";
  if (deg > 292.5 && deg <= 337.5) return "↘️";
  return "➡️";
}

/**
 * Returns a Date object representing the next Saturday from today.
 * If today is Saturday, returns today.
 */
function getNextSaturday(fromDate) {
  fromDate = fromDate || new Date();
  const dayOfWeek = fromDate.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const nextSaturday = new Date(fromDate);
  nextSaturday.setDate(fromDate.getDate() + daysUntilSaturday);
  nextSaturday.setHours(0, 0, 0, 0); // reset to midnight
  return nextSaturday;
}

function isSaturdayWithinNextNDays(n = 2) {
  const now = new Date();
  const saturday = getNextSaturday();
  const diffDays = Math.ceil((saturday - now) / (1000 * 60 * 60 * 24));
  return diffDays <= n;
}

function getTempColor(temp) {
  temp = parseFloat(temp);  // Ensure it's a number
  if (temp > 35) return '#ff3300';  // Red (matches your existing .high)
  if (temp > 30) return '#ff9900';  // Orange
  if (temp > 15) return '#ffffff';  // White
  if (temp > 8) return '#4dff88';   // White
  if (temp > 0) return '#00ffff';   // Ice Blue  
  return 'white';
}

function getUVColor(index) {
  temp = parseFloat(index);  // Ensure it's a number
  if (index > 10) return '#5900b3';  // Purple
  if (index > 8) return '#ff3300';   // Red
  if (index > 5) return '#ff6600';   // Dark Orange
  if (index > 2) return '#e6b800';   // Light Orange  
  return '88cc00';                   // Green 
}
// Helper: consistent fallback image
function getFallbackImage() {
  return 'https://images.unsplash.com/photo-1601134467661-3d775b999c8b?ixlib=rb-4.0.3&auto=format&fit=crop&q=80'; // clear sky
}

function loadBackgroundRegistry() {
  //const cache = CacheService.getScriptCache();
  //const cached = cache.get("WZ_BG_REGISTRY");
  //if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("WZ Image Registry");
  if (!sh) throw new Error("Missing sheet: WZ Image Registry");

  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const map = {};

  rows.forEach(([code, fileId, size, active]) => {
    if (!active || !fileId) return;

    map[Number(code)] = getDriveImageUrl(
      String(fileId).trim(),
      size || 1200
    );
  });

  //cache.put("WZ_BG_REGISTRY", JSON.stringify(map), 21600); // 6 hrs
  return map;
}

function normalizeDriveId(id) {
  return String(id)
    .trim()
    .replace(/.*\/d\//, "")
    .replace(/\/.*/, "");
}

function getDriveImageUrl(fileId, size = 1200) {
  const cleanId = normalizeDriveId(fileId);
  return `https://lh3.googleusercontent.com/d/${cleanId}=w${size}`;
}


function getBackgroundImage(code) {
  const registry = loadBackgroundRegistry();
  return registry[code] || registry[0]; // fallback mandatory
}

function getWindScale(wind){
  temp = parseFloat(wind);  // Ensure it's a number
  if (wind > 47.52) return 'Storm';  
  if (wind > 39.96) return 'Strong Gale';  
  if (wind > 32.94) return 'Gale';  
  if (wind > 26.46) return 'Near Gale';   
  if (wind > 20.52) return 'Strong Breeze';
  if (wind > 15.12) return 'Fresh Breeze';  
  if (wind > 10.26) return 'Moderate Breeze';  
  if (wind > 5.94) return 'Gentle Breeze';   
  if (wind > 2.70) return 'Light Breeze';  
  if (wind > 0.53) return 'Light Air'; 
  return 'Calm';
}
