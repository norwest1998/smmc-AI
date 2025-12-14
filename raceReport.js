/* raceReport.gs
* Generate a polished regatta race report using AI.
* Requires OpenAI API key stored in config.
*/


function generateRaceReport(parsed, scoresMap, weather, venue, highlights) {
const cfg = getConfig();
const apiKey = cfg.openAiApiKey;
if (!apiKey) throw new Error('OpenAI API key not configured.');


// Build results array for AI input
const results = Object.values(scoresMap).slice().sort((a,b)=>a.total - b.total).map((s,idx) => ({
position: idx+1,
member: s.member ? s.member.name : '',
sail: s.sail,
total: s.total,
placements: s.placements
}));


// Construct prompt for AI
const prompt = `Generate a race report for the following regatta:


Regatta Name: ${parsed.regattaName}
Class: ${parsed.className}
Date: ${parsed.date}
Venue: ${venue}
Weather: ${weather}
Highlights: ${highlights || ''}


Results:
${JSON.stringify(results, null, 2)}


Produce a clear, readable race report in text format, including a short summary, context about conditions, and a final standings table.`;


// Call OpenAI API
const url = 'https://api.openai.com/v1/chat/completions';
const payload = {
model: 'gpt-4',
messages: [{ role: 'user', content: prompt }],
temperature: 0.7
};


const options = {
method: 'post',
contentType: 'application/json',
headers: { 'Authorization': 'Bearer ' + apiKey },
payload: JSON.stringify(payload),
muteHttpExceptions: true
};


const response = UrlFetchApp.fetch(url, options);
const data = JSON.parse(response.getContentText());


if (!data.choices || !data.choices.length) return 'No report generated.';


const reportText = data.choices[0].message.content;
return reportText;
}
