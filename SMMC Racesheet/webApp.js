// Handles GET requests from GitHub Pages
function doGet(e) {
  try {
    var raceNum = getNextRaceNumberAndTick();
    var config = getRaceConfig(raceNum);
    
    // Fetch the start audio URL
    var audioUrl = getAudioFileUrl(config.raceType, config.audioFileOption);
    config.audioUrl = audioUrl;

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      config: config
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    // If the frontend is requesting AI Analysis
    if (payload.action === "analyzeAudio") {
      var aiResult = callGeminiApi(payload.media, payload.mediaType, payload.participants);
      
      // Save results to sheet automatically after AI responds
      var responseMessage = saveRaceAndHandicaps({
        raceNumber: payload.raceNumber,
        columnIndex: payload.columnIndex,
        results: aiResult.results,
        dnfList: aiResult.dnfList
      });

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: responseMessage,
        results: aiResult
      })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Secure server-side call to Gemini
function callGeminiApi(base64Audio, mimeType, participants) {
  // Retrieve the hidden API key safely from Script Properties
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in Script Properties.");
  }
  const modelId = "gemini-2.5-flash"; // Use "gemini-2.0-flash" when available
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  var promptText = "You are an official race scorer. Analyze the provided ambient audio recording along with the competitor list: " 
    + JSON.stringify(participants) 
    + ". Identify finished sail numbers, elapsed times, DNS and DNF boats. Return STRICT JSON format: { 'results': [ {'sailNo': String, 'place': Number, 'elapsedTime': Number} ], 'dnfList': [ String ], 'dnsList': [ String ] }";

  var requestBody = {
    "contents": [{
      "parts": [
        { "text": promptText },
        {
          "inline_data": {
            "mime_type": mimeType,
            "data": base64Audio
          }
        }
      ]
    }],
    "generationConfig": {
      "response_mime_type": "application/json"
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(requestBody),
    "muteHttpExceptions": true
  };

  var response = UrlFetchApp.fetch(apiUrl, options);
  var jsonResponse = JSON.parse(response.getContentText());

  if (jsonResponse.candidates && jsonResponse.candidates[0].content.parts[0].text) {
    return JSON.parse(jsonResponse.candidates[0].content.parts[0].text);
  } else {
    throw new Error("Gemini API Error: " + response.getContentText());
  }
}

// Scans Row 4 (Cols C to N) for unticked race
function getNextRaceNumberAndTick() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Race Results Sheet");
  
  if (!sheet) throw new Error("Sheet 'Race Results Sheet' not found.");
  
  var row4Values = sheet.getRange(4, 3, 1, 12).getValues()[0];
  var targetRaceNum = 1;
  var targetColIndex = 3;

  for (var i = 0; i < row4Values.length; i++) {
    if (row4Values[i] === false || row4Values[i] === "") {
      targetRaceNum = i + 1;
      targetColIndex = i + 3;
      break;
    }
  }

  sheet.getRange(4, targetColIndex).setValue(true);
  return targetRaceNum;
}

// Gets configuration for the active race
function getRaceConfig(raceNumber) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rs = ss.getSheetByName("Race sheet") || ss.getSheetByName("Race Sheet");
  var activeCol = raceNumber + 2;
  var participants = getRaceParticipants();
  
  var maxHandicap = participants.length > 0 
    ? Math.max.apply(Math, participants.map(function(p) { return p.handicap || 0; }))
    : 0;

  var raceType = rs ? rs.getRange("E2").getValue() : "Scratch";
  var audioFileOption = "1";

  if (raceType === "Scratch") {
    audioFileOption = (rs && rs.getRange("E3").getValue() === "1 minute tape") ? "1" : "2";
  } else {  
    audioFileOption = (maxHandicap <= 200) ? "1" : "2";
  }

  return {
    raceNumber: raceNumber,
    columnIndex: activeCol,
    raceType: raceType,
    maxHandicap: maxHandicap,
    audioFileOption: audioFileOption,
    participants: participants
  };
}

// Fetches active participants from 'Race sheet'
function getRaceParticipants() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Race sheet") || ss.getSheetByName("Race Sheet");
  if (!sheet) return [];

  var startRow = 7;
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return [];

  var values = sheet.getRange(startRow, 2, lastRow - startRow + 1, 7).getValues();
  var participants = [];

  values.forEach(function(row) {
    if (String(row[0]).trim().toUpperCase() === "Y") {
      participants.push({
        attending: row[0],
        name: row[1],
        sailNo: row[2],
        model: row[3],
        starting: row[4],
        current: row[5],
        handicap: Number(row[6]) || 0
      });
    }
  });

  return participants;
}

// Retrieves audio link from Drive folder
function getAudioFileUrl(seqType, seqOption) {
  var folderId = "1Po1oIivcQjayQWmO9CmdTLs0SdJxnrj9"; 
  var folder = DriveApp.getFolderById(folderId);

  var fileName = "";
  if (seqType === 'Scratch') {
    fileName = (seqOption === '1') ? "Scratch Start - 1 Minute Countdown.mp3" : "Scratch Start - 2 Minute Countdown.mp3";
  } else {
    fileName = (seqOption === '1') ? "Handicap Start - 60 down 200 up.mp3" : "Handicap Start - 60 down 300 up.mp3";
  }

  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  }
  throw new Error("File not found in Drive: " + fileName);
}

// Saves finisher positions and updates handicaps
function saveRaceAndHandicaps(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultsSheet = ss.getSheetByName("Race Results Sheet");
  var col = payload.columnIndex;
  
  resultsSheet.getRange(5, col, 20, 1).clearContent();
  if (payload.results && payload.results.length > 0) {
    for (var i = 0; i < payload.results.length && i < 20; i++) {
      resultsSheet.getRange(5 + i, col).setValue(payload.results[i].sailNo);
    }
  }

  if (payload.dnfList && payload.dnfList.length > 0) {
    for (var d = 0; d < payload.dnfList.length; d++) {
      resultsSheet.getRange(25 + d, col).setValue(payload.dnfList[d]);
    }
  }

  updateHandicapSheet(payload.raceNumber, payload.results);
  return "Race " + payload.raceNumber + " results saved & Handicaps updated!";
}

function updateHandicapSheet(raceNumber, results) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hSheet = ss.getSheetByName("Handicaps");
  
  if (!hSheet) {
    hSheet = ss.insertSheet("Handicaps");
    hSheet.appendRow(["Race No", "Sail No", "Place", "Elapsed Time (s)", "New Handicap (s)"]);
  }

  if (!results || results.length === 0) return;

  results.forEach(function(item) {
    var place = item.place;
    var currentHandicap = item.handicap || 0;
    var adjustment = (place === 1) ? 10 : (place === 2) ? 5 : (place > 5) ? -5 : 0;
    var newHandicap = Math.max(0, currentHandicap + adjustment);
    hSheet.appendRow([raceNumber, item.sailNo, place, item.elapsedTime, newHandicap]);
  });
}