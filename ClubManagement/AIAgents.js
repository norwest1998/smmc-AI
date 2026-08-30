/**
 * Prepares the payload and calls the AI agent.
 * @param {string} userQuery e.g., "list of DF65 sailors"
 */

function queryMemberContactAgent(userQuery) {
  const contactData = getAIContactPayload();

  const systemPrompt = `You are an expert database search agent. Use the provided member array to return a list to satisfy the user's intent.

  SEARCH RULES:
  1. Use conversational filler words like "all", "list of", "show me", "sailors", "members", "people" as insight to the intent of the query.
  2. Class Matching ('classesSailed'):
    - Map aliases: "DF65" matches "df65", "DF65", "DragonForce 65", or "Dragon Force 65".
    - Map aliases: "DF95" matches "df95", "DF95", "DragonFlite 95", or "Dragon Flite 95".
    - Do not use case-sensitive matching.
    - Treat queries mentioning a class as a filter for 'classesSailed'.
  3. Boolean Matching:
    - "paid" / "unpaid" refers to the 'paid' boolean.
    - "active" / "inactive" refers to the 'active' boolean.
  4. Membership Matching: membership types (Full, Affiliate, IOM, Expired)

  OUTPUT REQUIREMENT:
  Return ONLY a valid JSON array of matching member objects. Do not wrap in markdown block quotes (\`\`\`json) and do not add explanatory text. If no matches exist, return [].`;

  const promptPayload = {
    systemPrompt: systemPrompt,
    userQuery: userQuery,
    contextData: contactData
  };

  return callAIAgent(promptPayload);
}

function callAIAgent(payload) {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing in Script Properties.');

  const model = 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    system_instruction: { parts: [{ text: payload.systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: `Data Context:\n${JSON.stringify(payload.contextData)}` },
          { text: `User Query: ${payload.userQuery}` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json" // Force Gemini to respond with raw JSON
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());

  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    return data.candidates[0].content.parts[0].text;
  } else {
    throw new Error('Failed to extract response from Gemini API.');
  }
}

function getAIContactPayload() {
  const masterData = getMasterData();

  // Map member names to their active classes
  const classesByMember = {};
  
  Object.keys(masterData.classMembersMap).forEach(className => {
    masterData.classMembersMap[className].forEach(boat => {
      if (!classesByMember[boat.membername]) {
        classesByMember[boat.membername] = new Set();
      }
      classesByMember[boat.membername].add(className);
    });
  });

  // Create flat, LLM-friendly member records
  return masterData.members.map(m => ({
    memberId: m.memberId,
    active: Boolean(m.active),
    name: m.membername,
    membershiptype: m.membershiptype,
    start: m.startdate,
    end: m.enddate,
    paidUp: Boolean(m.paidUp),
    phone: m.phone || "-",
    email: m.email || "-",
    classesSailed: Array.from(classesByMember[m.membername] || [])
  }));
}
