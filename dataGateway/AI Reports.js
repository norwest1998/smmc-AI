// Script property keys
const PROP_GEMINI_API_KEY = "GEMINI_API_KEY";

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {
    geminiKey: props.getProperty(PROP_GEMINI_API_KEY) || null,
  };
}

function genRaceReportFromData(d) {
  const info = { eventID: d.eventID, regattaDate: d.regattaDate, startTime: d.startTime, endTime: d.endTime,
                 championshipName: d.regattaName, className: d.className, competitorCount: d.competitorCount };
  let leaderboard = [];
  try { leaderboard = getLeaderboard(d.regattaName); } catch (e) {}
  const weather = getRaceWeather_(d.regattaDate, d.startTime, d.endTime);
  const collected = JSON.stringify({ raceInfo: info, members: d.entries, races: d.races,
                                     standings: d.standings, leaderboard, weather });
  return callGemini_(collected);
}

function callGemini_(collectedData) {
  const prompt = `
    Role: Factual Sports Correspondent. 

    Operational Logic:
    - Logic: Open with Regatta/Championship name, round number AND date. Summarize the 1-2 lead performers. Summarize the day's racing as a whole. Mention the major mover.
    - Use the provided "standings" (net scores already include discards); do not recalculate.

    Mapping Instructions:
    - Always cross-reference [Members] with the [Sail Numbers] in parenthesis and use full names in the report.
    - Use low-score system and Treat 'DNS' or 'DNF' as a last-place finish +1 for scoring logic purposes when calculating standings impact.

    Constraints: 
    - Maximum length: 2 full paragraphs.
    - Narrative Prose Only: Do not use headings, subheadings, bullet points, or tables, do not repeat class if it is in the regattaName.
    - Do not list individual race-by-race results and Do not list the full standings nor list all participants.
    - **Selection Rule**: Only mention the top 2 performers of the day.
    - Strict Objectivity: Stick only to the provided facts. Do not invent "stories", "drama", or "external conditions".
    - ignore sailors at the bottom of the table with equal points completely
    `;

  const cfg = getConfig();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${cfg.geminiKey}`;
  const payload = {
    system_instruction: { parts: [{ text: prompt }] },
    contents: [{ parts: [{ text: "Generate the full report from this data. Do not truncate the summary: " + collectedData }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 10400, topP: 0.95 }
  };
  const response = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText());
  if (json.candidates && json.candidates[0].content) {
    return "AI Generated report, PLEASE READ CAREFULLY:" + json.candidates[0].content.parts[0].text;
  }
  throw new Error("Could not generate a full response.");
}

function getLeaderboard(regattaName){
  const folderName = "Overall Results Sheets";
  const sheetName = "Overall Results " + regattaName;

  const sheetId = findSheetInFolder(folderName,sheetName);
  if (!sheetId) {
    return{
    name: "None found",
    round: 0,
    data: []
  };
  }

  const overallSheet = SpreadsheetApp.openById(sheetId);
  const lb = overallSheet.getSheetByName("Overall results");
  const leaderboard = lb.getRange("C6:F").getValues();
  const roundNum = lb.getRange("D3").getValue() +1;
  const roundNumber = "Round No: " + roundNum;
    
  return {
    name: regattaName,
    round: roundNumber,
    data: leaderboard
  };
}

function getWeatherConfig() {
  return {
    spreadsheetId: '1EYuf5wi4Gw-4WP1hdg9sZsOO9tbRx_Z-q5go8BBEOGc',
    weatherFolderID: '1eJI3ky3bcn4FhBXu0tzneYvdyWJ4Ih98',
    calendarId: '1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM',
    sheetName: 'Forecast_3H'
  };
}

function getRaceWeather_(dateVal, startTime, endTime) {
  const sh = SpreadsheetApp.openById(getWeatherConfig().spreadsheetId)
    .getSheetByName('WZ Actual Hourly Archive');
  if (!sh || sh.getLastRow() < 2) return [];

  const tz = Session.getScriptTimeZone();
  const day = Utilities.formatDate(new Date(dateVal), tz, 'yyyy-MM-dd');
  const toMin = t => {
    const m = String(t instanceof Date ? Utilities.formatDate(t, tz, 'HH:mm') : t).match(/(\d+):(\d+)/);
    return m ? +m[1] * 60 + +m[2] : null;
  };
  const s = toMin(startTime), e = toMin(endTime);
  if (s === null || e === null) return [];

  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().reduce((out, r) => {
    const dt = r[0] instanceof Date ? r[0] : new Date(String(r[0]).replace(' ', 'T'));
    if (isNaN(dt) || Utilities.formatDate(dt, tz, 'yyyy-MM-dd') !== day) return out;
    const h = dt.getHours();
    if (h * 60 <= e && (h + 1) * 60 > s) {
      out.push({
        time: Utilities.formatDate(dt, tz, 'HH:mm'),
        windFrom: dirs[Math.round(r[1] / 22.5) % 16],
        windKnots: r[2], tempC: r[3], feelsLikeC: r[4],
        humidityPct: r[5], rainMm: r[6] || 0, pressureHpa: r[7]
      });
    }
    return out;
  }, []);
}