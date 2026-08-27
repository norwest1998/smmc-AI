//======================================
// // FILE: appsscript.html
//======================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Calendar",
        "version": "v3",
        "serviceId": "calendar"
      }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}

//======================================
// // FILE: onEdit.gs
//======================================

 function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row = range.getRow();
  const col = range.getColumn();
  
  // 1. CONFIGURATION - Match these exactly to your header text
  const COL_NAMES = ["Date", "Class", "Regatta Type", "HexKey", "Competition"];
  const headerRow = 1;

  // 2. DYNAMIC COLUMN MAPPING
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIdx = {};
  COL_NAMES.forEach(name => colIdx[name] = headers.indexOf(name) + 1);

  // Exit if headers are missing
  if (!colIdx["HexKey"] || row <= headerRow) return;

  const currentHex = sheet.getRange(row, colIdx["HexKey"]).getValue();
  const competition = sheet.getRange(row, colIdx["Competition"]).getValue();

  // --- FEATURE A: PREVENT MANIPULATION OF LOCKED ROWS ---
  // If a HexKey exists, prevent editing Date, Class, or Regatta Type
  const protectedCols = [colIdx["Date"], colIdx["Class"], colIdx["Regatta Type"], colIdx["HexKey"]];
  
if (currentHex !== "" && protectedCols.includes(col)) {

    if (e.oldValue !== undefined) {
      // Restore the old value
      range.setValue(e.oldValue); 
      
      // If the column being edited is the Date column, force the format back to a Date
      if (col === colIdx["Date"]) {
        range.setNumberFormat("dd/mm/yyyy"); 
      }

      SpreadsheetApp.getUi().alert("⛔ PROTECTED: This event is locked because it has a HexKey.");
      return;
    }
  }

  // --- FEATURE B: GENERATE HEXKEY WHEN ROW IS COMPLETE ---
  // Only generate key if Date, Class, and Regatta Type are all filled
  const eventData = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const isRowComplete = eventData[colIdx["Date"]-1] && 
                        eventData[colIdx["Class"]-1] && 
                        eventData[colIdx["Regatta Type"]-1];

  if (isRowComplete && currentHex === "" && competition === "Competition") {
    let newKey;
    const allExistingKeys = sheet.getRange(2, colIdx["HexKey"], sheet.getLastRow(), 1).getValues().flat();
    
    do {
      newKey = [...Array(8)].map(() => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    } while (allExistingKeys.includes(newKey));

    sheet.getRange(row, colIdx["HexKey"]).setValue(newKey);
    // Optional: Visual cue that the row is now locked
    sheet.getRange(row, 1, 1, headers.length).setBackground("#f3f3f3"); 
  }
}



//======================================
// // FILE: Regional Conflicts.gs
//======================================



function checkRegionalConflicts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // Find column indices
  const headers = data[0];
  const dateCol = headers.indexOf('Date');
  const classCol = headers.indexOf('Class');
  const conflictsCol = headers.indexOf('Regional Conflicts');
  
  if (dateCol === -1 || classCol === -1 || conflictsCol === -1) {
    SpreadsheetApp.getUi().alert('Required columns not found. Please ensure columns named "Date", "Class", and "Regional Conflicts" exist.');
    return;
  }
  
  const eventsUrl = 'https://radiosailing.org.au/index.php?arcade=events';
  const resultsUrl = 'https://radiosailing.org.au/index.php?arcade=results-list';
  
  // Fetch both pages
  let futureEvents = [];
  let pastEvents = [];
  
  try {
    futureEvents = scrapeEvents(eventsUrl);
    Logger.log('Found ' + futureEvents.length + ' future events');
  } catch (e) {
    Logger.log('Error fetching future events: ' + e);
  }
  
  try {
    pastEvents = scrapeEvents(resultsUrl);
    Logger.log('Found ' + pastEvents.length + ' past events');
  } catch (e) {
    Logger.log('Error fetching past events: ' + e);
  }
  
  const allEvents = futureEvents.concat(pastEvents);
  
  // Group calendar events by date to handle multiple events on same day
  const dateGroups = {};
  for (let i = 1; i < data.length; i++) {
    const eventDate = new Date(data[i][dateCol]);
    const eventClass = data[i][classCol];
    
    if (!eventDate || !eventClass) continue;
    
    const dateKey = eventDate.toDateString();
    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = [];
    }
    dateGroups[dateKey].push({
      rowIndex: i,
      date: eventDate,
      class: eventClass
    });
  }
  
  // Process each unique date
  for (const dateKey in dateGroups) {
    const group = dateGroups[dateKey];
    
    // Collect all unique conflicts for this date across all classes
    const allConflictsForDate = new Map();
    
    group.forEach(calEvent => {
      const conflicts = findConflicts(calEvent.date, calEvent.class, allEvents);
      
      conflicts.forEach(conflict => {
        // Use URL as unique key to avoid duplicates
        if (!allConflictsForDate.has(conflict.url)) {
          allConflictsForDate.set(conflict.url, conflict);
        }
      });
    });
    
    const uniqueConflicts = Array.from(allConflictsForDate.values());
    uniqueConflicts.forEach(c => Logger.log('    - ' + c.name));
    
    // Only update the FIRST row for this date, leave others blank
    if (uniqueConflicts.length > 0) {
      const firstCell = sheet.getRange(group[0].rowIndex + 1, conflictsCol + 1);
      const richText = createHyperlinkRichText(uniqueConflicts);
      firstCell.setRichTextValue(richText);
      
      // Clear the other rows for this date
      for (let j = 1; j < group.length; j++) {
        sheet.getRange(group[j].rowIndex + 1, conflictsCol + 1).clearContent();
      }
    } else {
      // No conflicts - clear all rows for this date
      group.forEach(calEvent => {
        sheet.getRange(calEvent.rowIndex + 1, conflictsCol + 1).clearContent();
      });
    }
  }
  
  SpreadsheetApp.getUi().alert('Regional conflicts check completed!');
  
  // Now update the Upcoming Events sheet
  updateUpcomingEvents(sheet, dateCol, conflictsCol);
}

function updateUpcomingEvents(eventDataSheet, dateCol, conflictsCol) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Try to find the Upcoming Events sheet
  let upcomingSheet = spreadsheet.getSheetByName('Upcoming Events');
  
  if (!upcomingSheet) {
    Logger.log('Upcoming Events sheet not found - skipping update');
    return;
  }
  
  Logger.log('Updating Upcoming Events sheet...');
  
  // Get all data from Event Data sheet
  const allData = eventDataSheet.getDataRange().getValues();
  
  if (allData.length === 0) {
    Logger.log('No data in Event Data sheet');
    return;
  }
  
  const headers = allData[0];
  Logger.log('Total columns in Event Data: ' + headers.length);
  
  // Find the Date column index
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  
  // Find which rows to copy (date >= today)
  const rowsToCopy = [1]; // Always include header row
  
  for (let i = 1; i < allData.length; i++) {
    const rowDate = new Date(allData[i][dateCol]);
    
    if (rowDate >= today) {
      rowsToCopy.push(i + 1); // +1 because sheet rows are 1-indexed
    }
  }
  
  Logger.log('Found ' + (rowsToCopy.length - 1) + ' upcoming events to copy');
  
  // Clear the Upcoming Events sheet
  upcomingSheet.clear();
  
  // Add a delay after clearing
  Utilities.sleep(1000);
  
  // Copy rows in a single batch operation to avoid rate limits
  // Copy columns B, C, D, E, G, H, I, J (skipping F which is column 6, index 5)
  const columnsToInclude = [1, 2, 3, 4, 6, 7, 8, 9]; // B, C, D, E, G, H, I, J (0-indexed)
  const dataToWrite = [];
  const richTextInfo = [];
  
  rowsToCopy.forEach((sourceRow, index) => {
    try {
      // Get data from specified columns only
      const rowData = columnsToInclude.map((colIndex, arrayIndex) => {
        const cell = eventDataSheet.getRange(sourceRow, colIndex + 1);
        const formula = cell.getFormula();
        const value = cell.getValue();
        
        // For Month column (first column, arrayIndex 0), always use value not formula
        // This prevents formula references from breaking when columns are rearranged
        if (arrayIndex === 0) {
          return value;
        }
        
        // For other columns, use formula if it exists, otherwise use value
        return formula !== '' ? formula : value;
      });
      
      dataToWrite.push(rowData);
      
      // Track rich text for Regional Conflicts (originally column J, now at position 7 in our array)
      if (conflictsCol === 9 && index > 0) { // Skip header row for rich text
        richTextInfo.push({
          sourceRow: sourceRow,
          targetRow: dataToWrite.length
        });
      }
      
    } catch (e) {
      Logger.log('ERROR reading row ' + sourceRow + ': ' + e.toString());
      dataToWrite.push(Array(8).fill('')); // Add empty row to maintain alignment
    }
  });
  
  // Write all data at once (8 columns now)
  if (dataToWrite.length > 0) {
    try {
      upcomingSheet.getRange(1, 1, dataToWrite.length, 8).setValues(dataToWrite);
      Logger.log('Data written successfully');
      
      // Wait before next operations
      Utilities.sleep(1000);
      
      // Insert a new column E (column 5)
      upcomingSheet.insertColumnAfter(4); // Insert after column D (which is column 4)
      Utilities.sleep(500);
      
      // Fill the new column E with the formula (skip header row)
      if (dataToWrite.length > 1) {
        Logger.log('Adding formulas to new column E...');
        const formulaRange = upcomingSheet.getRange(2, 5, dataToWrite.length - 1, 1); // Start from row 2, column E
        const formulas = [];
        
        for (let i = 2; i <= dataToWrite.length; i++) {
          formulas.push(['=IF(ISNA(VLOOKUP($F' + i + ',Attributes!$A$2:$B$7,2,FALSE)),Attributes!$C$1,VLOOKUP($F' + i + ',Attributes!$A$2:$B$7,2,FALSE))']);
        }
        
        formulaRange.setFormulas(formulas);
      }
      
      // Wait before applying rich text
      Utilities.sleep(1000);
      
      // Apply rich text formatting for Regional Conflicts (now at column 9 after insertion)
      if (conflictsCol === 9) {     
        richTextInfo.forEach((info, index) => {
          try {
            const sourceCell = eventDataSheet.getRange(info.sourceRow, 10); // Column J = 10
            const targetCell = upcomingSheet.getRange(info.targetRow, 9); // Column 9 after column E insertion
            
            const richText = sourceCell.getRichTextValue();
            if (richText && richText.getText().trim() !== '') {
              targetCell.setRichTextValue(richText);
            }
            
            // Add delay every 20 cells to avoid rate limits
            if (index > 0 && index % 20 === 0) {
              Utilities.sleep(500);
            }
            
          } catch (e) {
            Logger.log('ERROR applying rich text to row ' + info.targetRow + ': ' + e.toString());
          }
        });
      }
      
    } catch (e) {
      Logger.log('ERROR writing data: ' + e.toString());
      SpreadsheetApp.getUi().alert('Error updating Upcoming Events: ' + e.toString());
      return;
    }
  }
  
  // Format the header row (now 9 columns total after insertion)
  try {
    upcomingSheet.getRange(1, 1, 1, 9)
      .setFontWeight('bold')
      .setBackground('#f3f3f3');
  } catch (e) {
    Logger.log('ERROR formatting header: ' + e.toString());
  }
  
  // Format the sheet
  try {
    Logger.log('Applying sheet formatting...');
    
    // Align columns B, C, D, E horizontally center
    if (dataToWrite.length > 0) {
      upcomingSheet.getRange(1, 2, dataToWrite.length, 1).setHorizontalAlignment('center'); // Column B
      upcomingSheet.getRange(1, 3, dataToWrite.length, 1).setHorizontalAlignment('center'); // Column C
      upcomingSheet.getRange(1, 4, dataToWrite.length, 1).setHorizontalAlignment('center'); // Column D
      upcomingSheet.getRange(1, 5, dataToWrite.length, 1).setHorizontalAlignment('center'); // Column E
    }
    
    // Auto-size all columns first
    for (let col = 1; col <= 9; col++) {
      upcomingSheet.autoResizeColumn(col);
    }
    
    // Set column E width to 45 pixels
    upcomingSheet.setColumnWidth(5, 45);
    
    // Auto-size all rows and set vertical alignment to center
    upcomingSheet.autoResizeRows(1,dataToWrite.length);
      
    // Set vertical alignment for all data
    upcomingSheet.getRange(1, 1, dataToWrite.length, 9).setVerticalAlignment('middle');
    
    Logger.log('Sheet formatting complete');
    
  } catch (e) {
    Logger.log('ERROR applying formatting: ' + e.toString());
  }
  
  Logger.log('Upcoming Events sheet updated with ' + (rowsToCopy.length - 1) + ' events');
}

function scrapeEvents(url) {
  const response = UrlFetchApp.fetch(url);
  const html = response.getContentText();
  const events = [];
  
  // Determine if this is the events page (6 columns) or results page (5 columns)
  const isEventsPage = url.includes('arcade=events');
  
  // Find the table body content between <tbody> tags or look for table rows
  const tablePattern = /<tr[^>]*>(.*?)<\/tr>/gis;
  let tableMatch;
  
  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const rowHtml = tableMatch[1];
    
    // Skip header rows and rows without td elements
    if (rowHtml.includes('<th') || !rowHtml.includes('<td')) continue;
    
    // Extract all cells
    const cellPattern = /<td[^>]*>(.*?)<\/td>/gis;
    const cells = [];
    let cellMatch;
    
    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }
    
    if (cells.length < 4) continue;
    
    let monthStr, dateStr, eventCell, classStr, stateStr;
    
    if (isEventsPage) {
      // Events page: 6 columns - Month | Date | Event | Class | State | Country
      // cells[0] = Month (e.g., "Jan 2026")
      // cells[1] = Date (e.g., "10 Jan 2026" or "Postponed" or icon)
      // cells[2] = Event with link and location
      // cells[3] = Class
      // cells[4] = State
      // cells[5] = Country
      monthStr = stripHtml(cells[0]).trim();
      dateStr = stripHtml(cells[1]).trim();
      eventCell = cells[2];
      classStr = stripHtml(cells[3]).trim();
      stateStr = stripHtml(cells[4]).trim();
    } else {
      // Results page: 5 columns - Month | Date | Event | Class | State
      // cells[0] = Month (e.g., "Dec 2025")
      // cells[1] = Date (e.g., "06 Dec 2025")
      // cells[2] = Event with link and location
      // cells[3] = Class
      // cells[4] = State
      monthStr = stripHtml(cells[0]).trim();
      dateStr = stripHtml(cells[1]).trim();
      eventCell = cells[2];
      classStr = stripHtml(cells[3]).trim();
      stateStr = stripHtml(cells[4]).trim();
    }
    
    // Extract event name and URL from the link in eventCell
    const linkMatch = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]+)<\/a>/i.exec(eventCell);
    
    if (!linkMatch) continue;
    
    let eventUrl = linkMatch[1];
    let eventName = linkMatch[2].trim();
    
    // Remove "EVENT CANCELLED" prefix if present
    eventName = eventName.replace(/^EVENT CANCELLED\s*/i, '');
    
    // Fix relative URLs
    if (!eventUrl.startsWith('http')) {
      eventUrl = 'https://radiosailing.org.au/' + eventUrl.replace(/^\.?\//, '');
    }
    
    // Parse date (format: "18 Jan 2026" or "Postponed")
    const parsedDate = parseEventDate(dateStr);
    
    events.push({
      name: eventName,
      url: eventUrl,
      class: classStr,
      state: stateStr,
      date: parsedDate,
      dateStr: dateStr,
      month: monthStr
    });
  }
  
  Logger.log('Scraped ' + events.length + ' events from ' + url);
  return events;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}

function parseEventDate(dateStr) {
  // Handle "Postponed" or empty dates
  if (!dateStr || dateStr.toLowerCase().includes('postponed') || dateStr.trim() === '') {
    return null;
  }
  
  // Parse format: "18 Jan 2026"
  const months = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
  };
  
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length < 3) return null;
  
  const day = parseInt(parts[0]);
  const monthStr = parts[1].toLowerCase().substring(0, 3);
  const year = parseInt(parts[2]);
  
  const month = months[monthStr];
  
  if (isNaN(day) || month === undefined || isNaN(year)) {
    return null;
  }
  
  return new Date(year, month, day);
}

function findConflicts(eventDate, eventClass, allEvents) {
  const conflicts = [];
  const threeDaysBefore = new Date(eventDate);
  threeDaysBefore.setDate(eventDate.getDate() - 3);
  const threeDaysAfter = new Date(eventDate);
  threeDaysAfter.setDate(eventDate.getDate() + 3);
  
  allEvents.forEach(event => {
    // Skip events without dates (postponed)
    if (!event.date) return;
    
    // Check if event date is within range (±3 days)
    if (event.date >= threeDaysBefore && event.date <= threeDaysAfter) {
      // Check class match
      const classMatch = (eventClass.toLowerCase() === 'general') || 
                        (eventClass.toLowerCase() === event.class.toLowerCase());
      
      if (classMatch) {
        conflicts.push({
          name: event.name,
          url: event.url
        });
      }
    }
  });
  
  return conflicts;
}

function createHyperlinkRichText(conflicts) {
  if (conflicts.length === 0) {
    return SpreadsheetApp.newRichTextValue().setText('').build();
  }
  
  // Build the complete text first
  let text = '';
  const linkRanges = [];
  
  conflicts.forEach((conflict, index) => {
    if (index > 0) text += '\n';
    const startPos = text.length;
    text += conflict.name;
    const endPos = text.length;
    
    if (conflict.url) {
      linkRanges.push({ start: startPos, end: endPos, url: conflict.url });
    }
  });
  
  // Create rich text with all text first
  const richTextBuilder = SpreadsheetApp.newRichTextValue().setText(text);
  
  // Then apply all the hyperlinks
  linkRanges.forEach(range => {
    richTextBuilder.setLinkUrl(range.start, range.end, range.url);
  });
  
  return richTextBuilder.build();
}

//======================================
// // FILE: Web App.gs
//======================================

// //=======================================================
// DAILY FORECAST CARD CSS
// Same tokens as the rest of the site (--glass-fill, --foam, etc).
// Kept as a standalone constant so it's easy to find/edit, and so it
// can be injected into the HTML output regardless of how renderPage()
// builds its <head>.
// //=======================================================



function doGet(e) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Web doGet Datasheet');

  const title = sheet.getRange('A1').getDisplayValue() || 'Race Day';
  const raceInfo = sheet.getRange('B2').getValue();

  let cardsHtml = ''; 

  // =========================
  // NO EVENTS CASE
  // =========================
  if (raceInfo === "No Events scheduled for the weekend") {
    cardsHtml = `
      <div class="race-card no-events">
        <img class="race-bg" src="${DEFAULT_BG_IMAGE}" alt="">
        <div class="card-content">
          <div class="heading">
            <h2>${raceInfo}</h2>
          </div>
        </div>
      </div>
    `;

    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, cardsHtml)))
      .setTitle(title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }


  // =========================
  // LOAD RACE DATA
  // =========================
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, '<p>No race data found</p>')));
  }

  const raceData = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  // =========================
  // WEATHER DATA (HOURLY)
  // =========================
  const props = PropertiesService.getScriptProperties();
  const weatherSSId = props.getProperty('WZHourlyID');
  if (!weatherSSId) {
    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, '<p>Weather spreadsheet ID not set</p>')));
  }

  const weatherSS = SpreadsheetApp.openById(weatherSSId);
  const weatherSheet = weatherSS.getSheetByName('WZ Hourly Data');
  if (!weatherSheet) {
    return HtmlService.createHtmlOutput(injectStyle(renderPage(title, '<p>Weather sheet not found</p>')));
  }

  const weatherData = weatherSheet.getDataRange().getValues();

  // =========================
  // WEATHER DATA (DAILY FORECAST) — used as fallback
  // =========================
  const dailySheet = weatherSS.getSheetByName('WZ Daily Forecast');
  const dailyData = dailySheet ? dailySheet.getDataRange().getValues() : [];

  // =========================
  // BUILD RACE CARDS (LOOP)
  // =========================

  raceData.forEach(row => {

    const regattaName = row[0];
    if (!regattaName) return;

    const startTime = row[1];
    const endTime = row[2];

    const startDisplay = Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'HH:mm');
    const endDisplay   = Utilities.formatDate(endTime, Session.getScriptTimeZone(), 'HH:mm');

    const raceDate = new Date(title); // Saturday
    Logger.log("Race day: " + raceDate);
    const bgImage = getWeatherPic(raceDate);

    let weatherRow = '';

    // --- HOURLY WEATHER LOOP (unchanged logic) ---
    let hourlyHtml = '';
    for (let i = 1; i < weatherData.length; i++) {
      const w = weatherData[i];
      if (!(w[0] instanceof Date)) continue;

      const weatherTime = w[0];
      if (weatherTime < startTime || weatherTime > endTime) continue;
      var wind = w[2] + getWindArrow(w[1]);
      var temp = Math.round(w[3]);
      var uvIdx = Math.round(w[9]);
      var uvColor = getUVColor(uvIdx);
      var tempColor = getTempColor(temp);

      const time = Utilities.formatDate(w[0], Session.getScriptTimeZone(), 'HH:mm');
      hourlyHtml += `
        <div class="weather-mini-card">
          <div class="time">${time}</div>
          <div class="temp">
            <span class="temp" style="color: ${tempColor};">
               ${temp}°
            </span>
          </div>
          <div class="wind">${wind}</div>
          <div class="rain">${(w[6] || 0)} mm</div>
          <div class="uvRow">
            <span class="uvVal" style="color: ${uvColor};">
              UV ${uvIdx}
            </span>
          </div>
        </div>
      `;
    }

    if (hourlyHtml) {
      weatherRow = `<div class="weather-cards-row">${hourlyHtml}</div>`;
    } else {
      const dailySummary = buildDailySummaryHtml(dailyData, raceDate);
      weatherRow = dailySummary ||
        '<div class="no-data">No weather data available</div>';
    }

    // --- CARD HTML ---
    cardsHtml += `
      <div class="race-card">
        <img class="race-bg" src="${bgImage}" alt="">
        <div class="card-content">
          <div class="heading">
            <h2>${regattaName}</h2>
          </div>
          <div class="race-time">${startDisplay} – ${endDisplay}</div>
          ${weatherRow}
        </div>
      </div>
    `;

  });

  // =========================
  // FINAL RENDER
  // =========================
  return HtmlService.createHtmlOutput(injectStyle(renderPage(title, cardsHtml)))
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1') 
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/**
 * Injects a CSS string into an already-built HTML page.
 * Wraps the CSS in <style> tags and inserts it just before </head> if
 * one exists; otherwise prepends it to the document. This means it works
 * no matter how renderPage() assembles its own <style> block — you don't
 * need to edit renderPage() at all.
 */
function injectStyle(html, css) {
  const styleTag = `<style>${css}</style>`;
  if (html.indexOf('</head>') !== -1) {
    return html.replace('</head>', styleTag + '</head>');
  }
  return styleTag + html;
}


/**
 * Finds the row in "WZ Daily Forecast" matching raceDate and returns a
 * rendered summary card, or null if no matching row / sheet is found.
 *
 * Expected columns (row[0]..row[8]):
 *   Date, weather_code, uv_index_max, precipitation_sum,
 *   wind_speed_10m_max, wind_speed_10m_mean, winddirection_10m_dominant,
 *   temperature_2m_min, temperature_2m_max
 */
function buildDailySummaryHtml(dailyData, raceDate) {
  if (!dailyData || dailyData.length < 2) return null;

  const targetY = raceDate.getFullYear();
  const targetM = raceDate.getMonth();
  const targetD = raceDate.getDate();

  for (let i = 1; i < dailyData.length; i++) {
    const row = dailyData[i];
    const rowDate = row[0];
    if (!(rowDate instanceof Date)) continue;

    const sameDay =
      rowDate.getFullYear() === targetY &&
      rowDate.getMonth() === targetM &&
      rowDate.getDate() === targetD;

    if (!sameDay) continue;

    const weatherCode   = row[1];
    const uvMax          = row[2] !== '' ? Math.round(row[2]) : null;
    const rainSum        = row[3] || 0;
    const windMax        = row[4];
    const windMean       = row[5];
    const windDir        = row[6];
    const tempMin        = Math.round(row[7]);
    const tempMax        = Math.round(row[8]);

    const desc = getWeatherDescription(weatherCode);
    const uvColor = uvMax !== null ? getUVColor(uvMax) : '#999';
    const maxTempColor = getTempColor(tempMax);
    const minTempColor = getTempColor(tempMin);
    const windArrow = getWindArrow(windDir);

    return `
      <div class="weather-daily-card">
        <div class="daily-icon">${desc.icon}</div>
        <div class="daily-desc">${desc.label}</div>
        <div class="daily-temps">
          <span class="temp-min" style="color:${minTempColor};">${tempMin}°
          </span> /
          <span class="temp-max" style="color:${maxTempColor};"> ${tempMax}°</span>
        </div>
        <div class="daily-row">
          <span class="wind">Wind ${windMean}–${windMax} kt ${windArrow}</span>
        </div>
        <div class="daily-row">
          <span class="rain"> Rain ${rainSum} mm</span>
          <span class="uvVal" style="color:${uvColor};">
            ${uvMax !== null ? 'UV ' + uvMax : ''}
          </span>
        </div>
      </div>
    `;
  }

  return null; // no matching date found in the forecast sheet
}


/**
 * Maps Open-Meteo style WMO weather codes to a short label + emoji icon.
 * Extend this list if your data source uses codes not listed here.
 */
function getWeatherDescription(code) {
  const map = {
    0:  { label: 'Clear sky',            icon: '☀️' },
    1:  { label: 'Mainly clear',         icon: '🌤️' },
    2:  { label: 'Partly cloudy',        icon: '⛅' },
    3:  { label: 'Overcast',             icon: '☁️' },
    45: { label: 'Fog',                  icon: '🌫️' },
    48: { label: 'Depositing rime fog',  icon: '🌫️' },
    51: { label: 'Light drizzle',        icon: '🌦️' },
    53: { label: 'Drizzle',              icon: '🌦️' },
    55: { label: 'Dense drizzle',        icon: '🌧️' },
    61: { label: 'Slight rain',          icon: '🌧️' },
    63: { label: 'Rain',                 icon: '🌧️' },
    65: { label: 'Heavy rain',           icon: '🌧️' },
    71: { label: 'Slight snow',          icon: '🌨️' },
    80: { label: 'Rain showers',         icon: '🌦️' },
    95: { label: 'Thunderstorm',         icon: '⛈️' }
  };

  return map[code] || { label: 'Forecast', icon: '🌡️' };
}

//======================================
// // FILE: helpers.gs
//======================================

/* //===================================================
   SINGLE HTML SHELL (NO DUPLICATION)
   //=================================================== */
function renderPage(title, bodyContent) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>

  <style>
    :root {
    --header-bg: #1f4e78;
    --radius: 8px;
    }

    /* 1. RESET & BOX MODEL - Prevents internal scrollbars */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      height: auto;
      width: 100%;
      /* This is the secret to killing the vertical scrollbar inside the iframe */
      overflow-x: hidden !important; 
      overflow-y: auto;
      background-color: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }

    /* 2. WRAPPER - This is the element the script measures */
    #content-measure {
      width: 100%;
      margin: 0;
      padding: 10px 15px 30px 15px; /* Bottom padding for card shadows */
      display: flow-root; /* Prevents margin collapse from shrinking the height */
    }

    /* 3. HEADINGS */
    h1 {
      text-align: center;
      margin: 0;
      padding: 15px 0;
      font-size: 1.8em;
      color: #ffffff;
    }
    h2 {
      text-align: center;
      margin: 0;
      padding: 10px 0;
      font-size: 1.3em;
      color: #ffffff;
    }

    .header {
    background: var(--header-bg);
    color: #fff;
    text-align: center;
    padding: 12px;
  }

    /* 4. CONTAINER (Mobile First) */
    .cards-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      width: 100%;
    }

    /* 5. DESKTOP LAYOUT (Breakpoints) */
    @media (min-width: 768px) {
      .cards-container {
        flex-direction: row;
        justify-content: center;
        flex-wrap: wrap;
        height: auto;
      }
    }

    /* 6. RACE CARD STYLES */
    .race-card {
      position: relative;
      width: 100%;
      max-width: 420px;
      background: linear-gradient(
        to bottom,
        rgba(160, 160, 160, 0.15),
        rgba(160, 160, 160, 0.45)
        );
      border-radius: 16px;
      padding: 15px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      text-align: center;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .race-card.no-events {
      min-height: 220px;
      display: flex;
      flex-direction: column; /* Ensure vertical stacking */
      justify-content: center;
      align-items: center;
      padding: 15px;
      overflow: visible; /* Ensure nothing is hidden from measurement */
      background: linear-gradient(
        to bottom,
        rgba(160, 160, 160, 0.15),
        rgba(160, 160, 160, 0.45)
        );
      }

    .race-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }

    .race-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        rgba(160, 160, 160, 0.15),
        rgba(160, 160, 160, 0.45)
        );
      z-index: 1;
    }

    .card-content {
      position: relative;
      z-index: 2;
      color: #fff;
    }

    .race-time {
      font-size: 1.4em;
      font-weight: bold;
      color: #ffd700;
      margin-bottom: 15px;
    }

    /* 7. WEATHER ROW */
    .weather-cards-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      width: 100%;
    }

    .weather-mini-card {
      background: rgba(192, 192, 192, 0.1);
      backdrop-filter: blur(6px);
      color: #fff;
      border-radius: 5px;
      padding: 8px;
      flex: 0 0 80px;
      max-width: 110px;
      font-size: 14px;
    }

    .time {
      font-size: 0.75em;
      opacity: 0.85;
      color: #ffffff;
    }

    .temp {
      font-size: 1.4em;
      font-weight: 600;
    }

    .wind,
    .rain,
    .uvRow {
      font-size: 1em;
      opacity: 0.85;
    }
    .uvVal {font-size: 1em; font-weight: 600;}

    .weather-daily-card{
      display:flex;
      align-items:center;
      gap:8px;
      padding:8px 12px;
      margin-top:8px;
      border-radius:8px;
      background:linear-gradient(155deg, var(--glass-fill-hi), var(--glass-fill));
      border:1px solid var(--glass-border);
      backdrop-filter:blur(var(--glass-blur)) saturate(140%);
      -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(140%);
      box-shadow:
        0 1px 0 rgba(255,255,255,0.2) inset,
        0 12px 28px rgba(2,10,18,0.3);
      position:relative;
      flex-wrap:wrap;
    }
    .weather-daily-card::after{
      content:"";
      position:absolute; inset:0;
      border-radius:inherit;
      background:linear-gradient(120deg, rgba(255,255,255,0.12) 0%, transparent 30%);
      pointer-events:none;
    }
    .daily-icon{
      font-size:34px;
      line-height:1;
      flex:none;
      filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25));
    }
    .daily-desc{
      font-family:var(--font-body);
      font-size:13.5px;
      font-weight:600;
      color:var(--foam);
      flex:1 1 120px;
      min-width:100px;
    }
    .daily-temps{
      font-family:var(--font-data);
      font-size:20px;
      flex:none;
      display:flex;
      align-items:baseline;
      gap:4px;
    }
    .daily-temps .temp-max{ font-weight:500; }
    .daily-temps .temp-min{
      font-size:13px;
      color:var(--foam-dim);
    }
    .daily-row{
      width:100%;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      font-family:var(--font-data);
      font-size:13px;
      color:var(--foam-dim);
      letter-spacing:0.02em;
      padding-top:6px;
      margin-top:6px;
      border-top:1px solid var(--glass-border);
    }
    .daily-row .wind{ color:var(--foam-dim); }
    .daily-row .rain{ color:var(--foam-dim); }
    .daily-row .uvVal{ font-weight:500; }

  </style>
</head>

<body>
  <div id="content-measure">

    <h2>${title}</h2>

    <div class="cards-container">
      ${bodyContent}
    </div>

  </div>
</body>
</html>
`;
}


function getTempColor(temp) {
  temp = parseFloat(temp);

  if (temp > 35) return '#f20c0c';      // Red
  if (temp > 31) return '#b96200';      // Orange
  if (temp > 28) return '#8c7400';      // Yellow
  if (temp > 22) return '#4dff88';      // Green
  if (temp > 18) return '#008057';      // Teal
  if (temp > 13) return '#00747a';      // Cyan (aqua)
  if (temp > 10) return '#03d9f3';      // Sky blue
  if (temp > 5)  return '#0091d9';      // Aqua blue  ← was #2705fa (indigo/violet)
  return '#00539c';                     // Deep blue  ← was #00008b (near-black, breaks the gradient feel)
}

function getUVColor(index) {
  temp = parseFloat(index);  // Ensure it's a number
  if (index > 10) return '#5900b3';  // Purple
  if (index > 8) return '#ff3300';   // Red
  if (index > 5) return '#ff6600';   // Dark Orange
  if (index > 2) return '#e6b800';   // Light Orange  
  return '88cc00';                   // Green 
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

function sheetToObjects(ss, sheetName, keys) {
  try {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return [];
    const results = [];
    for (let r=1;r<data.length;r++) {
      const row = data[r];
      const obj = {};
      for (let i=0;i<keys.length;i++) obj[keys[i]] = row[i] !== undefined ? (row[i]===''? null: row[i]) : null;
      results.push(obj);
    }
    return results;
  } catch (e) {
    Logger.log('sheetToObjects error: ' + e);
    return [];
  }
}

// date object
function createDateObject(input){
  // Split date and time
  const [datePart, timePart] = input.trim().split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Create Date object (month is 0-based)
  const dateObj = new Date(year, month - 1, day, hour, minute);
  return dateObj
}

// Regional Conflicts Checker for Sailing Club Calendar
// Checks Radio Sailing Australia website for conflicting events

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Tools')
    .addItem('Check Regional Conflicts', 'checkRegionalConflicts')
    .addItem('Add to Google Calendar', 'addToGoogleCalendar')
    .addItem('Update Upcoming Calendar', 'updateUpcoming')
    .addToUi();
}

function setupMonthlyTriggers() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Create triggers for 1st and 15th of each month at 6 AM
  ScriptApp.newTrigger('checkRegionalConflicts')
    .timeBased()
    .onMonthDay(1)
    .atHour(6)
    .create();
    
  ScriptApp.newTrigger('checkRegionalConflicts')
    .timeBased()
    .onMonthDay(15)
    .atHour(6)
    .create();
    
  SpreadsheetApp.getUi().alert('Monthly triggers set for 1st and 15th of each month at 6 AM');
}

function getArrow(dir) {
  if (isNaN(dir) || dir === '') return '';
  dir = parseFloat(dir) % 360;
  const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
  const index = Math.round(dir / 45) % 8;
  return arrows[index];
}


// Helper: consistent fallback image
function getFallbackImage() {
  return 'https://images.unsplash.com/photo-1601134467661-3d775b999c8b?ixlib=rb-4.0.3&auto=format&fit=crop&q=80'; // clear sky
}

function loadBackgroundRegistry() {
  const spreadsheetId = WEATHER_SS_ID;
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sh = ss.getSheetByName(IMAGE_REGISTRY_SHEET);
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



//======================================
// // FILE: addToGoogle.gs
//======================================

function addToGoogleCalendar() {
  // var ui = SpreadsheetApp.getUi();
  //try {
    // Get the active spreadsheet and Upcoming Event Data sheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var eventSheet = spreadsheet.getSheetByName('APP Upload Matrix');
    if (!eventSheet) {
      ui.alert('Error: "Event Data" sheet not found.');
      return;
    }
    
    // Get all data (assuming headers in row 1, data starts at row 2)
    var data = eventSheet.getDataRange().getValues();
    if (data.length < 2) {
      console.log('No events found in "Event Data" sheet.');
      return;
    }

    // Open the Club Management spreadsheet (replace with actual ID)    
    var cfg = getConfig();
    var clubSpreadsheetId = cfg.clubManagementID;
    var clubSpreadsheet = SpreadsheetApp.openById(clubSpreadsheetId);

    // ClassMembers: boatId | Active | MemberName | ClassName | SailNumber
    const allClassMembersRows = sheetToObjects(clubSpreadsheet,'ClassMembers',
      ['boatId','active','membername','classname',
       'sailnumber','model','handicap','HRN',	'gh'
      ]);

    // ✅ Keep only ACTIVE boats
    const classMembersRows = allClassMembersRows.filter(r => r.active && r.active.toString().trim().toLowerCase() === 'active');
    const classGHRows = allClassMembersRows.filter(
      r => r.active 
      && r.active.toString().trim().toLowerCase() === 'active'
      && r.gh === 'Y' );

    // array of membername, sailNumber by class
    const classMembersMap = {};                // create empty object
    classMembersRows.forEach(r => {
      if (!classMembersMap[r.classname])      // if no array for this class yet
        classMembersMap[r.classname] = [];    // create it
      classMembersMap[r.classname].push({     // add member object into array
        membername: r.membername,
        sailnumber: r.sailnumber,
        boatId: r.boatId
      });
    });
    // array for GH Members
    const ghClass = 'General';
    classGHRows.forEach(r => { 
      if (!classMembersMap[ghClass])      // if no array for this class yet
        classMembersMap[ghClass] = [];    // create it
      classMembersMap[ghClass].push({     // add member object into array
        membername: r.membername,
        sailnumber: r.sailnumber,
        boatId: r.boatId
      });
    });

    // Get all member data
    var memberSheet = clubSpreadsheet.getSheetByName('Members');
    if (!memberSheet) {
      console.log('Error: "Members" sheet not found in Club Management spreadsheet.');
      return;
    }
    var memberData = memberSheet.getDataRange().getValues();

    var cfg = getConfig();
    var calendarId = 'primary';
    var calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) {
      console.log('Error: Calendar not found. Check the ID.');
      return;
    }
    
    const todayDate = new Date();

    // Process each event row (starting from index 1 to skip headers)
    for (var i = 1; i < data.length; i++) {
      var eventName = data[i][23];  // Column X
      var eventDate = new Date(data[i][1]);  // Column B (date object)
      var eventClass = data[i][4]; // Column E
      var start = createDateObject(data[i][18]); // Column E
      var end = createDateObject(data[i][19]); // Column E
      var eventType = data[i][7]; // Column E

      // Skip invalid rows
      if (!eventName || !eventDate || !(eventDate instanceof Date) || !eventClass || !eventType) {
        continue;
      }

      if (eventDate >= todayDate) {

        // Find eligible members for this class (active boat)
        var eligibleEmails = [];
        var classMembers = classMembersMap[eventClass];
        if(classMembers.length > 0){
          for (var j = 0; j < classMembers.length; j++) {  
            var memberName =  classMembers[j].membername;
            for (var k = 1; k < memberData.length; k++) {  // Skip headers
              if (memberData[k][2] === memberName && memberData[k][1] === "Y"){
                eligibleEmails.push(memberData[k][8]);
              }
            }
          }
                
          // Create the event and add guests if any
          if (eligibleEmails.length > 0) {
            var event = calendar.createEvent(eventName, start, end, {
              guests: eligibleEmails.join(','),
              sendInvites: true
            });
            console.log('Created event: ' + eventName + ' with ' + eligibleEmails.length + ' guests.');
          } else {
            // Create event without guests if no eligible members
            var event = calendar.createEvent(eventName, start, end);
            console.log('Created event: ' + eventName + ' (no eligible guests).');
          }
        }
      }
    }
    
    console.log('Events added to calendar and invitations sent successfully!');
  //} catch (error) {
  //  console.log('Error: ' + error.message);
  //  console.log(error);
  //}
}

//======================================
// // FILE: config.gs
//======================================

/* config.gs
* Global configuration, property keys, and setter helpers.
*/
const WEATHER_SS_ID = '1EYuf5wi4Gw-4WP1hdg9sZsOO9tbRx_Z-q5go8BBEOGc';
const DAILY_SHEET_NAME = 'WZ Daily Forecast';
const IMAGE_REGISTRY_SHEET = 'WZ Image Registry';

const DEFAULT_BG_IMAGE ='https://lh3.googleusercontent.com/d/1t7-6x1xF9ofD36oSfGY-avcnnwmpV19T=w1200';

const WEATHER_PIC_CACHE_HOURS = 12;

// Script property keys
const PROP_ClubManagementID = "ClubManagementID";
const PROP_CalendarID = "CalendarID";

// Keys used in the master data spreadsheet (sheet names)
const SHEET_MEMBERS = "Members"; // columns: MemberID, Name, Email, Telephone, WhatsApp
const SHEET_CLASSES = "Classes"; // columns: ClassID, ClassName, Description
const SHEET_CLASSMEMBERS = "ClassMembers"; // columns: ClassID, MemberID, Sail No
const SHEET_REGATTAS = "Regattas"; // columns: RegattaID, RegattaName, StartDate, EndDate

// Helper setters - run these once from the Apps Script editor to store secrets
function setMasterConfig(clubManagementID, calendarID) {
if (clubManagementID) PropertiesService.getScriptProperties().setProperty(PROP_MASTER_DATA_SPREADSHEET_ID, clubManagementID);
if (calendarID) PropertiesService.getScriptProperties().setProperty(PROP_RACE_UPLOAD_FOLDER_ID, calendarID);
Logger.log('Master config stored.');
}

function getProp(k) {
const v = PropertiesService.getScriptProperties().getProperty(k);
return v;
}

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {
    clubManagementID: props.getProperty(PROP_ClubManagementID) || null,
    calendarID: props.getProperty(PROP_CalendarID) || null,
  };
}

var Config = {
  get() {
    const props = PropertiesService.getScriptProperties();
    return {
      clubManagementID: props.getProperty(PROP_ClubManagementID),
      calendarID: props.getProperty(PROP_CalendarID)
    };
  }
};


//======================================
// // FILE: GetWeatherPic.gs
//======================================

/**
 * Returns a background image URL for a given race date (Saturday)
 *
 * @param {Date} raceDate
 * @return {string} image URL
 */
function getWeatherPic(raceDate) {
  Logger.log ("Getting Image");

  const tz = Session.getScriptTimeZone();
  const dateKey = Utilities.formatDate(raceDate, tz, 'yyyy-MM-dd');

  // -------------------------
  // Cache check
  // -------------------------
  const cache = CacheService.getScriptCache();
  const cached = cache.get('weatherPic_' + dateKey);
  if (cached) {
    Logger.log("Cached: " + cached)
    return cached;
  }

  try {
    const ss = SpreadsheetApp.openById(WEATHER_SS_ID);

    // -------------------------
    // DAILY FORECAST LOOKUP
    // -------------------------
    const dailySheet = ss.getSheetByName(DAILY_SHEET_NAME);
    if (!dailySheet) throw new Error('Daily sheet not found');

    const dailyData = dailySheet.getDataRange().getValues();
    if (dailyData.length < 2) throw new Error('No daily data');

    const header = dailyData[0];
    const dateCol = header.indexOf('Date');
    const codeCol = header.indexOf('weather_code');

    if (dateCol === -1 || codeCol === -1) {
      throw new Error('Required columns missing in daily sheet');
    }

    let weatherCode = null;

    for (let i = 1; i < dailyData.length; i++) {
      const rowDate = dailyData[i][dateCol];
      if (!(rowDate instanceof Date)) continue;

      const rowKey = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
      if (rowKey === dateKey) {
        Logger.log("HaVE TEH CODE");
        weatherCode = dailyData[i][codeCol];
        break;
      }
    }
Logger.log("weather code: " + weatherCode);
    if (!weatherCode) {
      cache.put(
        'weatherPic_' + dateKey,
        DEFAULT_BG_IMAGE,
        WEATHER_PIC_CACHE_HOURS * 3600
      );
      return DEFAULT_BG_IMAGE;
    }

    // -------------------------
    // IMAGE REGISTRY LOOKUP
    // -------------------------
    const imgSheet = ss.getSheetByName(IMAGE_REGISTRY_SHEET);
    if (!imgSheet) throw new Error('Image registry sheet not found');

    const imgData = imgSheet.getDataRange().getValues();
    const imgHeader = imgData[0];

    const codeIdx = imgHeader.indexOf('Code');
    const imgIdx = imgHeader.indexOf('Image');
    const activeIdx = imgHeader.indexOf('Active');

    if (codeIdx === -1 || imgIdx === -1) {
      throw new Error('Image registry columns missing');
    }

    let image = null;
    let imageUrl = null;

    for (let i = 1; i < imgData.length; i++) {
      const row = imgData[i];
      if (row[codeIdx] == weatherCode && row[activeIdx] !== false) {
        image = row[imgIdx];
        break;
      }
    }
    Logger.log("image: " + image);
    imageUrl = getDriveImageUrl(image, size = 1200)
    Logger.log("imageurl: " + imageUrl);
    const finalImage = imageUrl || DEFAULT_BG_IMAGE;

    // -------------------------
    // Cache result
    // -------------------------
    cache.put(
      'weatherPic_' + dateKey,
      finalImage,
      WEATHER_PIC_CACHE_HOURS * 3600
    );

    return finalImage;

  } catch (err) {
    Logger.log('getWeatherPic error: ' + err);
    return DEFAULT_BG_IMAGE;
  }
}



//======================================
// // FILE: UpdateUpcoming.gs
//======================================

function updateUpcoming() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Event Data');
  updateUpcomingEvents(sh, 2, 9);
}


//======================================
// // FILE: SyncCalendars.gs
//======================================

function syncMembersDirectlyToCalendarSeries() {
 
  // 1. Get Members and Boats Data
  var clubSpreadsheetId = "1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI";
  var ss = SpreadsheetApp.openById(clubSpreadsheetId);
  var memberSheet = ss.getSheetByName("Members");
  var boatSheet = ss.getSheetByName("ClassMembers");
  var memberData = memberSheet.getDataRange().getValues();
  var boatData = boatSheet.getDataRange().getValues();
  
  var mHeaders = memberData[0];
  var bHeaders = boatData[0];
  
  // 2. Connect to your Google Calendar
  var calendarId = "primary"; 
  var calendar = CalendarApp.getCalendarById(calendarId);
  
  // Fetch calendar events for the next 120 days to locate active series
  var now = new Date();
  var futureWindow = new Date(now.getTime() + (120 * 24 * 60 * 60 * 1000));
  var existingCalendarEvents = calendar.getEvents(now, futureWindow);

  // 3. Loop through members to find checked boxes in Column Q
  for (var i = 1; i < memberData.length; i++) {
    var memberRow = memberData[i];
    var isMemberActive = memberRow[mHeaders.indexOf("Active")];
    var memberName = memberRow[mHeaders.indexOf("MemberName")];
    var memberEmail = memberRow[mHeaders.indexOf("email")];
    var isSubscribed = memberRow[mHeaders.indexOf("Calendar Subscription")];
    
    // Process only active members who have Column Q checked (TRUE)
    if (!isMemberActive || !memberEmail || isSubscribed !== true) continue;
    
    Logger.log("Processing subscriptions for: " + memberName);
    
    // 4. Determine this member's eligible classes based on their active boats
    var memberClasses = new Set();
    for (var j = 1; j < boatData.length; j++) {
      var boatRow = boatData[j];
      var isBoatActive = boatRow[bHeaders.indexOf("Active")];
      var boatOwner = boatRow[bHeaders.indexOf("Member")];
      var boatClass = boatRow[bHeaders.indexOf("Class")];
      var isGH = boatRow[bHeaders.indexOf("GH")];
      
      if (isBoatActive && boatOwner === memberName) {
        if (boatClass === "Marblehead" || boatClass === "General") {
          memberClasses.add("General Handicap");
        } else if (["DF65", "DF95", "IOM", "Soling"].includes(boatClass)) {
          memberClasses.add(boatClass);
        }
        
        if (isGH === true || String(isGH).toUpperCase() === "TRUE") {
          memberClasses.add("General Handicap");
        }
      }
    }
    
    if (memberClasses.size === 0) continue;
    
    // Track series IDs we've already handled for this specific member to avoid duplicate work
    var processedSeriesIds = new Set();

    // 5. Look through the calendar events directly
    for (var k = 0; k < existingCalendarEvents.length; k++) {
      var calEvent = existingCalendarEvents[k];
      
      // We only care if it's a recurring series
      if (!calEvent.isRecurringEvent()) continue;
      
      var eventTitle = calEvent.getTitle();
      var eventSeries = calEvent.getEventSeries();
      var seriesId = eventSeries.getId();
      
      if (processedSeriesIds.has(seriesId)) continue;

      // 6. Check if the calendar event title matches any of the member's classes
      // Assumes your titles follow a pattern like "SMMC: DF65 Series" or contain the class name.
      var matchesMemberClass = false;
      memberClasses.forEach(function(className) {
        if (eventTitle.toLowerCase().includes(className.toLowerCase())) {
          matchesMemberClass = true;
        }
      });
      
      if (matchesMemberClass) {
        processedSeriesIds.add(seriesId);
        
        // Verify if they are already a guest on this series container
        var guests = eventSeries.getGuestList();
        var alreadyAdded = guests.some(function(g) {
          return g.getEmail().toLowerCase() === memberEmail.toLowerCase();
        });
        
        if (!alreadyAdded) {
          try {
            eventSeries.addGuest(memberEmail);
            Logger.log("Directly added " + memberEmail + " to series: " + eventTitle);
            Utilities.sleep(1000); // Prevents hitting Google ceilings
          } catch(err) {
            Logger.log("Error adding " + memberEmail + " to series " + eventTitle + ": " + err.message);
          }
        }
      }
    }
  }
}

//======================================
// // FILE: test.gs
//======================================

function myFunction() {
  var calendarId = 'Primary'; 
  var calendar = CalendarApp.getCalendarById(calendarId);
  
  // Fetch calendar events for the next 120 days to locate active series
  var now = new Date();
  var futureWindow = new Date(now.getTime() + (120 * 24 * 60 * 60 * 1000));
  var existingCalendarEvents = calendar.getEvents(now, futureWindow);
  
}


//======================================
// // FILE: Old Web App.gs
//======================================

function oldDoGet(e) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Web doGet Datasheet');

  const title = sheet.getRange('A1').getDisplayValue() || 'Race Day';
  const raceInfo = sheet.getRange('B2').getValue();

  let cardsHtml = ''; 

  // =========================
  // NO EVENTS CASE
  // =========================
  if (raceInfo === "No Events scheduled for the weekend") {
    cardsHtml = `
      <div class="race-card no-events">
        <img class="race-bg" src="${DEFAULT_BG_IMAGE}" alt="">
        <div class="card-content">
          <div class="heading">
            <h2>${raceInfo}</h2>
          </div>
        </div>
      </div>
    `;

    return HtmlService.createHtmlOutput(renderPage(title, cardsHtml))
      .setTitle(title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }


  // =========================
  // LOAD RACE DATA
  // =========================
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return HtmlService.createHtmlOutput(renderPage(title, '<p>No race data found</p>'));
  }

  const raceData = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  // =========================
  // WEATHER DATA
  // =========================
  const props = PropertiesService.getScriptProperties();
  const weatherSSId = props.getProperty('WZHourlyID');
  if (!weatherSSId) {
    return HtmlService.createHtmlOutput(renderPage(title, '<p>Weather spreadsheet ID not set</p>'));
  }

  const weatherSS = SpreadsheetApp.openById(weatherSSId);
  const weatherSheet = weatherSS.getSheetByName('WZ Hourly Data');
  if (!weatherSheet) {
    return HtmlService.createHtmlOutput(renderPage(title, '<p>Weather sheet not found</p>'));
  }

  const weatherData = weatherSheet.getDataRange().getValues();

  // =========================
  // BUILD RACE CARDS (LOOP)
  // =========================

  raceData.forEach(row => {

    const regattaName = row[0];
    if (!regattaName) return;

    const startTime = row[1];
    const endTime = row[2];

    const startDisplay = Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'HH:mm');
    const endDisplay   = Utilities.formatDate(endTime, Session.getScriptTimeZone(), 'HH:mm');

    const raceDate = new Date(title); // Saturday
    Logger.log("Race day: " + raceDate);
    const bgImage = getWeatherPic(raceDate);

    let weatherRow = '<div class="no-data">No hourly weather data available</div>';

    // --- OPTIONAL: WEATHER LOOP (unchanged logic) ---
    let hourlyHtml = '';
    for (let i = 1; i < weatherData.length; i++) {
      const w = weatherData[i];
      if (!(w[0] instanceof Date)) continue;

      const weatherTime = w[0];
      // Only include hours during the race
      if (weatherTime < startTime || weatherTime > endTime) continue;
      var wind = w[2] + getWindArrow(w[1]);
      var temp = Math.round(w[3]);
      var uvIdx = Math.round(w[9]);
      var uvColor = getUVColor(uvIdx);
      var tempColor = getTempColor(temp);
      
      const time = Utilities.formatDate(w[0], Session.getScriptTimeZone(), 'HH:mm');
      hourlyHtml += `
        <div class="weather-mini-card">
          <div class="time">${time}</div>
          <div class="temp">
            <span class="temp" style="color: ${tempColor};">
               ${temp}°
            </span>
          </div>
          <div class="wind">${wind}</div>
          <div class="rain">${(w[6] || 0)} mm</div>
          <div class="uvRow">
            <span class="uvVal" style="color: ${uvColor};">
              UV ${uvIdx}
            </span>
          </div>
        </div>
      `;
    }

    if (hourlyHtml) {
      weatherRow = `<div class="weather-cards-row">${hourlyHtml}</div>`;
    }
    
    // --- CARD HTML ---
    cardsHtml += `
      <div class="race-card">
        <img class="race-bg" src="${bgImage}" alt="">
        <div class="card-content">
          <div class="heading">
            <h2>${regattaName}</h2>
          </div>
          <div class="race-time">${startDisplay} – ${endDisplay}</div>
          ${weatherRow}
        </div>
      </div>
    `;

  });

  // =========================
  // FINAL RENDER
  // =========================
  return HtmlService.createHtmlOutput(renderPage(title, cardsHtml))
    .setTitle(title)
    // This line is non-negotiable for mobile resizing
    .addMetaTag('viewport', 'width=device-width, initial-scale=1') 
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

