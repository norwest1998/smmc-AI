/* utils.gs - helper utilities shared across modules */

/**
 * Finds the value corresponding to a label in a key:value sheet format.
 * Expects label in column A and value in column B.
 */
function findLabelValue(values, label) {
    const searchLabel = (label || '').toLowerCase();
    for (let r = 0; r < values.length; r++) {
        const row = values[r];
        const cellValue = (row[0] || '').toString().trim().replace(':', '').toLowerCase();
        if (cellValue.includes(searchLabel)) {
            return (row[1] || '').toString().trim();
        }
    }
    return null;
}

/**
 * Tries to normalize a date string into a Date object or standard string.
 */
function tryNormalizeDate(dateRaw) {
    if (!dateRaw) return null;
    // Simple attempt to convert if it's not already a Date object
    const date = new Date(dateRaw);
    if (!isNaN(date)) {
        // You might want a specific format here, e.g., 'YYYY-MM-DD'
        return date.toISOString().split('T')[0]; 
    }
    return dateRaw; // Return raw string if normalization fails
}

// copy of aiParseSpreadsheet from earlier single-file but minimal — place here for completeness if you want Gemini fallback
function aiParseSpreadsheet(ss, file, geminiApiKey) {
  // keep as earlier implementation if needed; omitted here for brevity — use the aiParseSpreadsheet from prior script if desired
  return null;
}

function setConfigValue(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function getConfigValue(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
