// Main menu function to show sidebar
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Images')
    .addItem('Load Race Results', 'showSidebar')
    .addToUi();
}

// onEdit function to submit via mobile
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const editedCell = range.getA1Notation();

  // Target: "mobile submit" sheet, Cell M4 (Row 4, Column 13)
  if (sheet.getName() === "Current Regatta" && editedCell === "M4") {
    if(range.getValue() === true) installableOnSubmit(e);
  }
}

// Show the sidebar
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Race Results Selector')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

// Get list of image files from the folder
function getImageFiles() {
  const folderId = '1kLfQOZYgzjLS5drf4bDX5q-vR3nhcTSI';
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const imageFiles = [];
  
  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();
    
    // Check if file is an image
    if (mimeType.startsWith('image/')) {
      const fileId = file.getId();
      imageFiles.push({
        id: fileId,
        name: file.getName(),
        url: file.getUrl(),
        // Use Google Drive thumbnail URL format
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400'
      });
    }
  }
  
  return imageFiles;
}

// Process selected image and extract JSON data
function processImageFile(fileId) {
  const cfg = ResultsSheetParser.getConfig();
  const geminiKey = cfg.geminiKey;
  if (!geminiKey) throw new Error('Gemini API key not configured in Script Properties');


  
  const model = 'gemini-2.5-flash';
  
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64Image = Utilities.base64Encode(blob.getBytes());
    const mimeType = file.getMimeType();
    
    // Use Claude API to extract race results from image
    const prompt = `Extract race results data from this image and return ONLY a valid JSON object with this exact structure (no markdown, no explanations):
{
  "eventID": "a unique ID",
  "regattaName": "regatta/series name",
  "className": "class name",
  "date": "YYYY-MM-DD",
  "competitorCount": "number of boats",
  "raceReport": "race report text or empty string",
  "races": [
    {
      "raceNumber": "1",
      "positions": [699,725,75],
      "RO": [],
      "DNF": [],
      "DNS": []
    }
  ]
}

Important: Return ONLY the JSON object, no other text.`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        topK: 1,
        topP: 1,
        maxOutputTokens: 10048,
        responseMimeType: "application/json"
      }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": geminiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result.error) {
      throw new Error(`Gemini API Error: ${result.error.message}`);
    }

    let extractedText = result.candidates[0].content.parts[0].text;

    // Clean common JSON wrapper artifacts
    textContent = extractedText.replace(/^```json\s*|\s*```$/g, '').trim();    

    return JSON.parse(textContent);
    
  } catch (error) {
    throw new Error('Failed to process image: ' + error.message);
  }
}

// Populate the Current Regatta sheet with data
function populateSheet(jsonData, fileId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('Current Regatta');
    
    if (!sh) {
      throw new Error('Sheet "Current Regatta" not found');
    }
    
    // Clear existing race data
    sh.getRange("B10:M29").clearContent(); // positions
    sh.getRange("B32:M32").clearContent(); // RO
    sh.getRange("B34:M37").clearContent(); // DNF
    sh.getRange("B39:M42").clearContent(); // DNS
    
    // Set basic information
    sh.getRange("A1").setValue(jsonData.eventID);
    sh.getRange("B5").setValue(jsonData.date);
    sh.getRange("B6").setValue(jsonData.regattaName);
    
    // Process each race
    if (jsonData.races && jsonData.races.length > 0) {
      for (let i = 0; i < Math.min(jsonData.races.length, 12); i++) {
        const race = jsonData.races[i];
        const colOffset = i; // Column offset from B (0 = B, 1 = C, etc.)
        
        // Positions (B10:M29 - up to 20 positions per race)
        if (race.positions && race.positions.length > 0) {
          for (let j = 0; j < Math.min(race.positions.length, 20); j++) {
            sh.getRange(10 + j, 2 + colOffset).setValue(race.positions[j]);
          }
        }
        
        // RO (B32:M32)
        if (race.RO && race.RO.length > 0) {
          sh.getRange(32, 2 + colOffset).setValue(race.RO.join(', '));
        }
        
        // DNF (B34:M37 - up to 4 DNF entries per race)
        if (race.DNF && race.DNF.length > 0) {
          for (let j = 0; j < Math.min(race.DNF.length, 4); j++) {
            sh.getRange(34 + j, 2 + colOffset).setValue(race.DNF[j]);
          }
        }
        
        // DNS (B39:M42 - up to 4 DNS entries per race)
        if (race.DNS && race.DNS.length > 0) {
          for (let j = 0; j < Math.min(race.DNS.length, 4); j++) {
            sh.getRange(39 + j, 2 + colOffset).setValue(race.DNS[j]);
          }
        }
      }
    }
    configSh = ss.getSheetByName('Config')
    configSh.getRange("D1").setValue(fileId);

    return { success: true, message: 'Race results loaded successfully!' };
    
  } catch (error) {
    throw new Error('Failed to populate sheet: ' + error.message);
  }
}