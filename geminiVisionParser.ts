/**
 * Parses a race results IMAGE using Gemini Vision and returns a parsed object
 * compatible with your existing pipeline (same structure as parseSimplifiedRegattaSheet)
 *
 * @param {GoogleAppsScript.Drive.File} imageFile - The uploaded image file
 * @return {Object} parsed - Same shape as parseSimplifiedRegattaSheet output
 */
function parseRaceResultsFromImage(imageFile) {
  const cfg = getConfig();
  const geminiKey = cfg.geminiKey;
  if (!geminiKey) throw new Error('Gemini API key not configured in Script Properties');

  const blob = imageFile.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());

  // Choose model: gemini-1.5-flash (fast & cheap) or gemini-1.5-pro (more accurate for complex tables)
  const model = 'gemini-1.5-flash-latest';

  const prompt = `
You are an expert at reading sailing race result scorecards from images.

Extract ALL information accurately and return ONLY valid JSON in this exact structure:

{
  "eventID": "extract or generate a unique ID if visible (e.g., from top-left cell), otherwise use filename without extension",
  "regattaName": "extract regatta/series name",
  "className": "extract class (e.g., Laser, Optimist, Division 1)",
  "date": "extract date in YYYY-MM-DD format (convert if needed)",
  "competitorCount": "number of boats/entries (look for 'Entries', 'Boats', 'Fleet' etc.)",
  "raceReport": "any race officer notes or summary text (optional, can be empty string)",
  "races": [
    {
      "sailNumber": "string",
      "positions": ["1", "2", "DNC", "3", ...]  // one entry per race, use strings to preserve DNS/DNC/RO etc.
    },
    ...
  ]
}

Rules:
- Look for columns like Pos, Sail #, Helm/Competitor, R1, R2, R3..., Total/Net.
- Preserve special codes exactly: DNC, DNS, DNF, RO, OCS, BFD, RET, DSQ.
- If a boat has no result in a race, use "DNC".
- Do not add explanations or markdown — only the raw JSON.
- If date is ambiguous, prefer DD/MM/YYYY or context from club.
`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: blob.getContentType(),
            data: base64
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
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
  extractedText = extractedText.replace(/^```json\s*|\s*```$/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(extractedText);
  } catch (e) {
    Logger.log("Raw Gemini output: " + extractedText);
    throw new Error("Failed to parse Gemini JSON response: " + e.message);
  }

  // Normalise date if needed
  if (parsed.date && !(parsed.date instanceof Date)) {
    const dateParts = parsed.date.split(/[-\/]/);
    if (dateParts.length === 3) {
      // Assume DD/MM/YYYY or MM/DD/YYYY — adjust based on your club's convention
      const [d, m, y] = dateParts.map(Number);
      // Most sailing clubs use DD/MM/YYYY
      parsed.date = new Date(y, m - 1, d);
    } else {
      parsed.date = new Date(parsed.date);
    }
  }

  // Ensure competitorCount is number
  parsed.competitorCount = Number(parsed.competitorCount) || parsed.races.length;

  // Generate fallback eventID from filename if missing
  if (!parsed.eventID) {
    parsed.eventID = imageFile.getName().replace(/\.[^.]+$/, ''); // remove extension
  }

  // Default race report if missing
  if (!parsed.raceReport) {
    const formattedDate = Utilities.formatDate(new Date(parsed.date), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    parsed.raceReport = `Race results for ${parsed.regattaName} sailed on the ${formattedDate}`;
  }

  Logger.log(`Gemini Vision successfully parsed image: ${imageFile.getName()}`);
  return parsed;
}