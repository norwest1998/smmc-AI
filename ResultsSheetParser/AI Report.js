  /**
  * Calls the Gemini API from Google Apps Script.
  * @param {Object} collectedData - Your race data JSON.
  */
  
  function genRaceReport() {

  // create prompt
  const prompt = `
    Role: Factual Sports Correspondent. 

    Operational Logic:
    - Logic: Open with Regatta/Race name, round number AND date. Summarize the 1-2 lead performers. Summarize the day's racing as a whole. Mention major mover.
    - Use discards for scoring, >3 races = 1 discard, > 7 races = 2 discards, > 15 = 3 discards. net score = gross score - discards.

    Mapping Instructions:
    - Always cross-reference [Sail Numbers] with the [Members] and use full names in the report.
    - Use low-score system and Treat 'DNS' or 'DNF' as a last-place finish +1 for scoring logic purposes when calculating standings impact.

    Constraints: 
    - Maximum length: 2 full paragraphs.
    - Narrative Prose Only: Do not use headings, subheadings, bullet points, or tables, do not repeat class if it is in the regattaName.
    - Do not list individual race-by-race results. Do not list the full standings. Do not list participants.
    - **Selection Rule**: Only mention the top 2 performers of the day.
    - Strict Objectivity: Stick only to the provided facts. Do not invent "stories", "drama", or "external conditions".
    - ignore sailors at the bottom of the table with equal points completely
    `;

//    - Opening: Start with the [Championship Name] and the [Class] or [Race Name], followed by the date, time, and weather.
//    - Weather Narrative: Describe the conditions using the mapped Wind Scale, temperature, rain levels, and UV index, ignore if no data.
//    - Performance Summary: State the number of races and total competitors. Identify and Summarize the 1-2 lead performers performance. 
//    - Standings & Movement: Compare the results against the [Prior Championship Standings]. Mention 1-2 key rank shifts. Briefly note the impact on the top absentee.

  // collect data
  const collectedData = collectData();

  // 1. Get your API Key from Script Properties (safest method)
  const cfg = getConfig();
  const apiKey = cfg.geminiKey;
  const modelId = "gemini-2.5-flash"; // Use "gemini-2.0-flash" when available
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  // 3. Build the JSON payload
  const payload = {
    "system_instruction": {
      "parts": [{ "text": prompt }]
    },
    "contents": [
      {
        "parts": [{ "text": "Generate the full report from this data. Do not truncate the summary: " + JSON.stringify(collectedData) }]
      }
    ],
    "generationConfig": {
      "temperature": 0.1,
      "maxOutputTokens": 10400,
      "topP": 0.95
    }
  };

  // 4. Set up the UrlFetchApp options
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true,
    "timeout": 60000
  };

  var report = "AI Generated report, PLEASE READ CAREFULLY:"
  // 5. Execute the fetch
  //try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());

    // Check if the model stopped because it ran out of tokens
    if (json.candidates && json.candidates[0].finishReason === "MAX_TOKENS") {
      Logger.log("WARNING: Report was truncated because it reached the maxOutputTokens limit.");
    }

    if (json.candidates && json.candidates[0].content) {
      report = report  + json.candidates[0].content.parts[0].text;
    } else {
      report = "Error: Could not generate a full response.";
    }
  //} catch (e) {
  //  Logger.log("Fetch failed: " + e.toString());
  //}
  // update report "E5"
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getRange("E5");

  // Set the value
  range.setValue(report);

  // Apply formatting to ensure visibility in merged cells
  range.setWrap(true);
  range.setVerticalAlignment("top");
  range.setHorizontalAlignment("left");
  range.setFontColor("#000000"); // Ensure black text
  range.setFontSize(8);        // Adjust size if it's too big to fit

  // Force the UI to update immediately
  SpreadsheetApp.flush();
}



function collectData() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getActiveSheet();

  // get Race information
  const raceInfo = {
    eventID: sh.getRange("A1").getValue(),
    regattaDate: sh.getRange("B5").getDisplayValue(), // getDisplayValue preserves date format
    startTime: sh.getRange("C5").getDisplayValue(),
    endTime: sh.getRange("D5").getDisplayValue(),
    championshipName: sh.getRange("B6").getValue(),
    className: sh.getRange("B7").getValue(),
    competitorCount: sh.getRange("B8").getValue(),
    roundNumber : sh.getRange("C6").getValue(),
  }
  var json = JSON.stringify({ raceInfo }, null, 2); 
  var collected = json;
  
  // Get Master Data
  const md = getMasterData();
  const members = md.classMembersMap[raceInfo.className];
  json = JSON.stringify({ members }, null, 2);
  var collected = collected + "\n" + json;

  // Get Race results Data
  // Race no | places | DNF | DNS
  const range = sh.getRange("B9:M42").getValues();   // 34 rows × 12 columns
  const races = [];
  for (let col = 0; col < range[0].length; col++) {
    const raceNumber = range[0][col];  // Row 0 = race number
    // Finishing positions: rows 1–20
    const finishers = range.slice(1, 21)
      .map(r => r[col])
      .filter(v => v !== "" && v !== null);
    // DNF: rows 25–28
    const dnf = range.slice(25, 29)
      .map(r => r[col])
      .filter(v => v !== "" && v !== null);
    // DNS: rows 30–33
    const dns = range.slice(30, 34)
      .map(r => r[col])
      .filter(v => v !== "" && v !== null);
    // 👉 Skip race if all lists are empty
    if (finishers.length === 0 && dnf.length === 0 && dns.length === 0) {
      continue;
    }
    races.push({
      race: raceNumber,
      finishers: finishers,
      dns: dns,
      dnf: dnf
    });
  }
  json = JSON.stringify({ races }, null, 2);
  collected = collected + "\n" + json;

  // Get Leaderboard 
  const champName = sh.getRange("B6").getValue();
  const leaderboard = getLeaderboard(champName);
  json = JSON.stringify({ leaderboard }, null, 2);
  collected = collected + "\n" + json;  
 
  return collected;
}
