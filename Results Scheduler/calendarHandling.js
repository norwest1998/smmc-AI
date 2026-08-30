/**
 * Scans the Google Sheet calendar for the next upcoming unprocessed event
 * (checking today and all future dates).
 * 
 * @param {string} spreadsheetId - The ID of your Google Sheet.
 * @param {string} sheetName - Tab name (default: 'Calendar').
 * @return {Object|null} Object with event details and End Time Date, or null if none found.
 */
function getNextUnprocessedEvent() {
  const spreadsheetId = CONFIG.calendarSpreadsheetId;
  const sheetName = 'Event Data';

  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      throw new Error(`Sheet tab "${sheetName}" was not found.`);
    }

    const data = sheet.getDataRange().getValues();
    const now = new Date();
    // Midnight at the start of today to ensure we catch today's events even if running early in the morning
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue; // Skip blank rows

      const eventId = row[0];
      const eventDate = new Date(row[2]);
      const eventName = row[6] + " " + row[7];
      const rawEndTime = row[4];
      const status = String(row[14]).toUpperCase().trim();

      // Ignore rows already marked PROCESSED
      if (status === 'PROCESSED' || status === 'TRUE') {
        continue;
      }

      const endTimeDate = combineDateAndTime(eventDate, rawEndTime);

      // Check if event end time is from today onwards
      if (endTimeDate >= startOfToday) {
        const isToday = eventDate.toDateString() === now.toDateString();

        Logger.log(`Found next unprocessed event: "${eventName}" on ${endTimeDate.toDateString()} at ${endTimeDate.toLocaleTimeString()} (Row ${i + 1})`);

        return {
          rowIndex: i + 1,       // Row index to update status later
          eventId: eventId,
          eventName: eventName,
          endTime: endTimeDate,  // Full JavaScript Date object (date + time)
          isToday: isToday
        };
      }
    }

    Logger.log("No upcoming unprocessed events found in calendar.");
    return null;

  } catch (error) {
    Logger.log("Error in getNextUnprocessedEvent: " + error.toString());
    return null;
  }
}

/**
 * Combines a Date cell and a Time cell into a single JavaScript Date object.
 */
function combineDateAndTime(dateObj, timeVal) {
  const result = new Date(dateObj);
  
  if (timeVal instanceof Date) {
    // Sheet stored time as a Date object
    result.setHours(timeVal.getHours(), timeVal.getMinutes(), timeVal.getSeconds(), 0);
  } else if (typeof timeVal === 'string' && timeVal.trim() !== '') {
    // Sheet stored time as text (e.g., "14:30" or "2:30 PM")
    const parts = timeVal.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i);
    if (parts) {
      let hours = parseInt(parts[1], 10);
      const minutes = parseInt(parts[2], 10);
      const seconds = parts[3] ? parseInt(parts[3], 10) : 0;
      const isPM = parts[4] && parts[4].toUpperCase() === 'PM';
      const isAM = parts[4] && parts[4].toUpperCase() === 'AM';
      
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
      
      result.setHours(hours, minutes, seconds, 0);
    }
  }
  return result;
}

/**
 * Updates Column D (Status) to "PROCESSED" for a given row index.
 * 
 * @param {number} rowIndex - 1-based row index returned by getNextUnprocessedEvent
 * @param {string} spreadsheetId - The ID of your Google Sheet.
 * @param {string} sheetName - Tab name (default: 'Calendar').
 */
function markCalendarEventProcessed(eventId) {
  const spreadsheetId = CONFIG.calendarSpreadsheetId;
  const sheetName = 'Event Data';

  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(sheetName);

    const targetId = String(eventId).trim();

    // Iterate through rows (skip header row)
    for (let i = 1; i < data.length; i++) {
      const rowEventId = String(data[i][0]).trim(); // Column A (Index 0)

      if (rowEventId === targetId) {
        // Update Column E (Column Index 5) -> Status
        sheet.getRange(i + 1, 14).setValue('PROCESSED');
        Logger.log(`Successfully marked Event ID "${eventId}" as PROCESSED at Row ${i + 1}.`);
        return true;
      }
    }    
    Logger.log(`Marked row ${rowIndex} as PROCESSED in sheet "${sheetName}".`);
  } catch (error) {
    Logger.log(`Error updating row ${rowIndex}: ` + error.toString());
  }
}
