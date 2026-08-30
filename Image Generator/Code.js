function generateWeeklyImage() {
  // Get weekend racing events.
  const result = getEvents();
  const events = result.events;
  const eventWeather = result.weatherData;

  for (let i = 1; i < events.length; i++) {
    let row = events[i];
    if(!row.eventClass) continue

    let startDateObj = (row.start instanceof Date) ? row.start : new Date(row.start);
    let startTime = Utilities.formatDate(startDateObj, Session.getScriptTimeZone(), "ha").toLowerCase();

    let endDateObj = (row.end instanceof Date) ? row.end : new Date(row.end);
    let endTime = Utilities.formatDate(endDateObj, Session.getScriptTimeZone(), "ha").toLowerCase();

    const sailingClassImage = getClassImageForAI(row.eventClass);
    const logoImage = getClassImageForAI();
  
    if (!sailingClassImage) return;

    const promptPayload = {
      "contents": [{
        "parts": [
          {
            "text": `Use the uploaded sailboat image as the main subject, preserving the boats. Include the association logo image, unchanged, in the top right-hand corner as the second subject. Create a polished 4:5 portrait promotional poster for Sydney Maritime Modellers Club.
Place the boat racing across a calm blue lake beneath a bright, partly cloudy sky, with soft morning light, subtle cool atmosphere, and gentle water ripples. Integrate the uploaded image naturally into the scene without altering the boat’s appearance. Use navy blue, white, and golden-yellow accents, with a clean, energetic sailing-club design.

Display these topics:
${row.name}
Saturday • ${startTime} to ${endTime}
Sydney Maritime Modellers Club
Lakeside, Solent Cct, Norwest NSW 2153
https://smmc1998.weebly.com/

FORECAST (Extract data and format as a weather report from this raw tracking matrix: ${eventWeather}. Example output style: Partly cloudy. High chance of showers, most likely in the morning. Winds southeasterly.)

Look forward to seeing you on the water!

Use modern sans-serif typography, strong visual hierarchy, excellent contrast, and generous spacing. Arrange the text around the boat without covering the sail or hull. Ensure every word is sharp, legible, correctly spelled, and fully visible. Do not add any extra text, logos, or watermarks.`
          },
          // Boat Base64 Attribute Mapping (expects "data:image/png;base64,xxxx...")
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": sailingClassImage.split(",")[1] || sailingClassImage // Strip out URL data header if present
            }
          },
          // Logo Base64 Attribute Mapping
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": logoImage ? (logoImage.split(",")[1] || logoImage) : ""
            }
          }
        ]
      }],
      "generationConfig": {
        "responseModalities": ["IMAGE"], // Instructs the model to output a fresh image configuration asset
      }
    };

    try {
      // 1. Call Google Imagen via Gemini Developer API
      let base64Data = callGoogleImagenAPI(promptPayload);
      
      // Define contextual naming variables
      let safeDateTime = Utilities.formatDate(startDateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
      let outputFileName = `${row.name}_${row.eventClass}_${safeDateTime}`;

      // 2. Convert base64 data to a file and save it to Google Drive
      let driveFileUrl = saveImageToDrive(base64Data, outputFileName);
      
      // 3. Log out success metrics
      Logger.log(`Successfully generated Google AI image for row ${i + 1}. Url: ${driveFileUrl}`);
      break; // Process one row per weekly automated trigger pipeline execution
      
    } catch (error) {
      Logger.log(`Error processing row ${i + 1}: ` + error.toString());
    }
  }
}


// Helper function to call Google's Imagen 3 Model
function callGoogleImagenAPI(payload) {
  const apiKey = GEMINI_API_KEY;
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=" + apiKey;

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  const json = JSON.parse(responseText);

  if (responseCode === 429) {
    const reason = json.error && json.error.status;
    throw new Error(
      "Rate limited (" + (reason || "429") + "). " +
      "If this is RESOURCE_EXHAUSTED with a daily quota message, billing/tier needs to be increased — retrying now won't help. " +
      "Full error: " + (json.error ? json.error.message : responseText)
    );
  }

  if (responseCode !== 200 || json.error) {
    let msg = json.error ? json.error.message : responseText;
    throw new Error("Gemini Image Call Failed (" + responseCode + "): " + msg);
  }

  try {
    return json.candidates[0].content.parts[0].inlineData.data;
  } catch (e) {
    throw new Error("Could not parse image bytes from API JSON response.");
  }
}

