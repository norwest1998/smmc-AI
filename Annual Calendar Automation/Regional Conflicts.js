

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