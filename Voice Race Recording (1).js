//======================================
// FILE: appsscript.html
//======================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}

//======================================
// FILE: AI Agent.gs
//======================================

/**
 * Main function: Fetches the latest MP3 race recording from the upload folder,
 * streams it directly to the Gemini 2.5 Flash API, parses the JSON response,
 * populates the active sheet, and archives the file.
 */
function processRaceAudioFromFolder() {
  // 1. Fetch parameters dynamically from Script Properties matching your exact names
  const scriptProperties = PropertiesService.getScriptProperties();
  const apiKey = scriptProperties.getProperty('GEMINI_API_KEY');
  const folderId = scriptProperties.getProperty('UPLOAD_FOLDER_ID');
  const processedFolderId = scriptProperties.getProperty('PROCESSED_FOLDER_ID');

  // Verify all properties exist before processing
  if (!apiKey) {
    throw new Error("Please add your 'GEMINI_API_KEY' to Script Properties.");
  }
  if (!folderId) {
    throw new Error("Please add your 'UPLOAD_FOLDER_ID' to Script Properties.");
  }
  if (!processedFolderId) {
    throw new Error("Please add your 'PROCESSED_FOLDER_ID' to Script Properties.");
  }

  // 2. Open folders and scan for the files
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  
  let latestFile = null;
  let latestTime = 0;
  
  while (files.hasNext()) {
    const file = files.next();
    const fileCreatedTime = file.getDateCreated().getTime();
    if (fileCreatedTime > latestTime) {
      latestTime = fileCreatedTime;
      latestFile = file;
    }
  }
  
  if (!latestFile) {
    Logger.log("[CHECKPOINT 1] FAILURE: No MP3 files found in the upload folder.");
    return;
  }
  
  Logger.log(`[CHECKPOINT 1] SUCCESS: Processing // FILE: "${latestFile.getName()}" (Size: ${(latestFile.getSize() / 1024 / 1024).toFixed(2)} MB)`);
  
  // 3. Prepare the binary data payload
  const blob = latestFile.getBlob();
  const base64Audio = Utilities.base64Encode(blob.getBytes());
  const mimeType = blob.getContentType();

  // 4. Set up strict instructions for the AI Agent
  const systemInstruction = 
    "You are an expert sailing race committee timekeeper. Your task is to listen to the provided audio file. " +
    "Find the exact timestamp relative to the audio timeline where the starting horn blows (e.g. 00:01:15). " +
    "Then, listen for boat numbers being called out and capture the exact timeline timestamp when each boat crosses. " +
    "You must output valid JSON matching the requested structural schema.";

  const prompt = `
    Listen closely to this race audio recording. Identify the start sequence horn time 
    and the relative time each boat number is called out crossing the line.
    
    Return the result exactly matching this JSON structural format:
    {
      "startTime": "HH:MM:SS",
      "finishes": [
        {"position": 1, "boatNumber": "42", "finishTime": "HH:MM:SS"},
        {"position": 2, "boatNumber": "17", "finishTime": "HH:MM:SS"}
      ]
    }
  `;

  // 5. Structure the Multimodal Endpoint call
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    "contents": [{
      "parts": [
        { "text": prompt },
        { "inlineData": { "mimeType": mimeType, "data": base64Audio } }
      ]
    }],
    "systemInstruction": { "parts": [{ "text": systemInstruction }] },
    "generationConfig": { "responseMimeType": "application/json" }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true // Allows capturing API messages instead of script crashes
  };

  // 6. Execute network requests and run diagnostics
  try {
    Logger.log("[CHECKPOINT 2] SENDING: Uploading audio payload to Gemini API...");
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`[CHECKPOINT 2] RESPONSE CODE RECEIVED: ${responseCode}`);
    
    if (responseCode !== 200) {
      Logger.log(`[CHECKPOINT 2] FAILURE: API returned an error: ${responseText}`);
      return;
    }
    
    const responseData = JSON.parse(responseText);
    const jsonString = responseData.candidates[0].content.parts[0].text;
    
    Logger.log("[CHECKPOINT 3] RAW AI TEXT OUTPUT:\n" + jsonString);
    
    const raceResults = JSON.parse(jsonString);
    
    Logger.log(`[CHECKPOINT 4] PARSED STRUCT: Found Start Time (${raceResults.startTime}) and ${raceResults.finishes ? raceResults.finishes.length : 0} boat rows.`);
    
    // 7. Write data and archive the source file upon success
    writeResultsToSheet(raceResults);
    moveFileToProcessedFolder(latestFile, folder, processedFolderId);
    
  } catch (error) {
    Logger.log("[FATAL EXCEPTION CRASH] Script failed during processing loop: " + error.toString());
  }
}

/**
 * Validates structural content and appends calculations directly to the sheet using native formulas.
 */
function writeResultsToSheet(data) {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  if (!data || !data.finishes || !Array.isArray(data.finishes) || data.finishes.length === 0) {
    Logger.log("Error Validation failed: The payload did not yield structured finish items.");
    throw new Error("The AI agent returned an empty boat results list. Check the execution logs.");
  }
  
  sheet.clear();
  
  sheet.appendRow(["RACE START TIME:", data.startTime || "00:00:00"]);
  sheet.appendRow([""]); 
  sheet.appendRow(["Position", "Boat Number", "Finish Time", "Elapsed Time", "Current Handicap", "Corrected Time", "Next Race Handicap"]);
  
  data.finishes.forEach(function(boat) {
    const position = boat.position || "";
    const boatNumber = boat.boatNumber || "Unknown";
    const finishTime = boat.finishTime || "00:00:00";

    const row = [
      position,
      boatNumber,
      finishTime,
      `=C${sheet.getLastRow() + 1}-$B$1`, // Dynamic formula for elapsed duration
      0.95, 
      `=D${sheet.getLastRow() + 1}*E${sheet.getLastRow() + 1}`, // Formula for corrected duration
      `=IF(F${sheet.getLastRow() + 1}<AVERAGE($F$4:$F$10), E${sheet.getLastRow() + 1}*1.01, E${sheet.getLastRow() + 1}*0.99)`
    ];
    sheet.appendRow(row);
  });
  
  // Apply native duration formatting
  sheet.getRange("B1").setNumberFormat("hh:mm:ss");
  if (sheet.getLastRow() >= 4) {
    sheet.getRange(`C4:D${sheet.getLastRow()}`).setNumberFormat("hh:mm:ss");
    sheet.getRange(`F4:F${sheet.getLastRow()}`).setNumberFormat("hh:mm:ss");
  }
  
  Logger.log("Race results successfully written to Sheet.");
}

/**
 * Shifts the successfully processed source audio file into the target folder.
 */
function moveFileToProcessedFolder(file, sourceFolder, destinationFolderId) {
  try {
    const destinationFolder = DriveApp.getFolderById(destinationFolderId);
    destinationFolder.addFile(file);
    sourceFolder.removeFile(file);
    Logger.log(`Successfully archived "${file.getName()}" to the Processed folder.`);
  } catch (e) {
    Logger.log(`Warning: Row data saved, but archiving operations failed: ${e.toString()}`);
  }
}

