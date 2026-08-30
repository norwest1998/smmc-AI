function renderVotingForm(tokenInfo) {
  // 1. Create the template from the file
  var template = HtmlService.createTemplateFromFile('VotingForm'); // or whatever your file is named

  template.applicantName = tokenInfo.applicantName;   

  template.applicantRowID = tokenInfo.applicantRowID; 
  template.token = tokenInfo.tokenString;

  const result = validateToken(template.token);
  template.committeeMember = result.cName;
 
  // 3. Return the evaluated HTML
  return template.evaluate()
      .setTitle('SMMC Membership Vote')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function generateToken(type, identifier, param, row, expiry) {
  const raw = type + '|' + identifier + '|' + param + '|' + row + '|' + expiry;
  const signature = Utilities.computeHmacSha256Signature(raw, "SMMCTokens");
  const encodedSig = signature.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  
  const token = Utilities.base64EncodeWebSafe(raw + '|' + encodedSig);
  return token; 
}

function verifyToken(token) {
  try {
    if (!token) return null;
    let cleanToken = decodeURIComponent(token);
    cleanToken = cleanToken.replace(/ /g, '+');
    const decodedBytes = Utilities.base64Decode(cleanToken);
    const text = Utilities.newBlob(decodedBytes).getDataAsString();
    
    const parts = text.split('|');
    if (parts.length !== 6) {
      Logger.log("Split failed. Parts count: " + parts.length);
      return null;
    }

    const [type, email, param, rowId, timestamp, sig] = parts;
    const raw = type + '|' + email + '|' + param + '|' + rowId + '|' +  timestamp;
    
    const expected = Utilities.computeHmacSha256Signature(raw, "SMMCTokens");
    const expectedHex = expected.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');

    if (expectedHex !== sig) {
      Logger.log("Signature mismatch!");
      return null;
    }
    const committeeMember = email;
    const applicantname = param;
    const applicantRowID = rowId;
    return { 
      valid: true, 
      tokenString: token,
      type: type,
      committeeMember: committeeMember,
      applicantName: applicantname,
      applicantRowID: applicantRowID,
      timestamp: timestamp
    };
  } catch (err) {
    Logger.log("Verify Error: " + err);
    return null;
  }
}

function validateToken(token) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tokensSheet = ss.getSheetByName(CONFIG.tokensSheetName);
  if (!tokensSheet) return {valid:false, reason:'Token store missing.'};
  const data = tokensSheet.getDataRange().getValues();

  let cleanToken = decodeURIComponent(token);
  cleanToken = cleanToken.replace(/ /g, '+');

  for (let r = 1; r < data.length; r++) {
    const rowToken = data[r][0];
    const type = data[r][1];
    const committeeName = data[r][2];
    const rowId = data[r][3];
    const used = data[r][4];
    const expiry = data[r][5];
    if (rowToken === cleanToken) {
      if (used === true || used === 'TRUE')        return {valid:false, reason:'This link has already been used.'};
      if (expiry && new Date(expiry) < new Date()) return {valid:false, reason:'This link has expired.'};
      
      // ensure application not processed
      const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
      const row = findRowByRowId(sheet, rowId);
      if (!row) return {valid:false, reason:'Application not found.'};

      const status = sheet.getRange(row, CONFIG.colStatus).getValue();
      if (status === 'Processed') return {valid:false, reason:'Application has already been processed.'};
      return {valid:true, rowId: rowId, cName: committeeName, row: row, type: type};
    }
  }
  return {valid:false, reason:'Invalid token.'};
}

function findRowByRowId(sheet, rowId) {
  console.log("In findRowbyRowId: " + rowId);
  const data = sheet.getRange(CONFIG.dataStartRow, CONFIG.colRowID, sheet.getLastRow()-CONFIG.dataStartRow+1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    console.log("data: " + data[i][0] + " rowid: " + rowId + " i: " + i);
    if (data[i][0] === rowId) return i + CONFIG.dataStartRow;
  }
  return null;
}


function handleVote(params) {
  
  // 1. Security Check: Validate Token
  const result = validateToken(params.token);

  if (!result.valid) {
    return `Error: This voting link is invalid - ${result.reason}`;
  }
  
  const rowId = result.rowId;
  const member = result.cName;
  const row = result.row;
  const type = result.type;
  const vote = (params.vote || '').toLowerCase();
  const reason = params.rejectionReason || '';

  if (!rowId || !member || !vote || !row) {
    return 'Missing parameters - require rowId, member, vote and row';
  }
  console.log("vote: " + vote + " member: " + member + " rowId: " + rowId + " row: " + row);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Membership Applications');

  // Update Reminder Date
  updateReminderDate(row);

  // Update lists
  let votesFor = (sheet.getRange(row, CONFIG.colVotesFor).getValue() || '').toString();
  let votesAgainst = (sheet.getRange(row, CONFIG.colVotesAgainst).getValue() || '').toString();

  // Clean lists to prevent duplicates
  votesFor     = removeNameFromList(votesFor, member);
  votesAgainst = removeNameFromList(votesAgainst, member, true);

  console.log("vote: " + vote + " member: " + member + " votesFor: " + votesFor);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (vote === 'approve') {
      appendVote(sheet, row, CONFIG.colVotesFor, member);
      addProcessNote(sheet, row, `Vote FOR by ${member}`);
    } else if (vote === 'reject') {
      appendVote(sheet, row, CONFIG.colVotesAgainst, member, reason, CONFIG.colRejectionReason);
      addProcessNote(sheet, row, `Vote AGAINST by ${member} - ${reason}`);
      initiateDeliberation(sheet, row);
    } else {
    console.log("no valid vote value received: " + vote);
    }    
    // mark token used
    markTokenUsed(token);
    // after recording vote, evaluate decision
    checkForFinalApproval(sheet, rowNumber);
  } finally {
    lock.releaseLock();
  }

  return `Thank you, ${member}. Your vote of '${vote}' has been recorded.`;
}



function removeNameFromList(listText, memberName, againstStyle) {
  if (!listText) return '';
  const items = listText.split(',').map(i => i.trim()).filter(Boolean);
  const filtered = items.filter(it => {
    if (againstStyle) {
      // against entries may be "Name: reason" or "Name"
      const namePart = it.split(':')[0].trim();
      return namePart.toLowerCase() !== memberName.toLowerCase();
    } else {
      return it.toLowerCase() !== memberName.toLowerCase();
    }
  });
  return filtered.join(', ');
}

function appendVote(sheet, rowNumber, col, text, reason, reasonCol) {
  const existing = sheet.getRange(rowNumber, col).getValue();
  let list = parseList(existing);
  
  // avoid duplicates
  if (!list.includes(text)) list.push(text);
  sheet.getRange(rowNumber, col).setValue(list.join(', '));
  
  // Only update the reason if reasonCol is passed
  if (reasonCol) {
    sheet.getRange(rowNumber, reasonCol).setValue(reason || '');
  }
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.toString().split(',').map(s => s.trim()).filter(s=>s.length>0);
}

function addNameToList(listText, name) {
  const items = listText ? listText.split(',').map(i => i.trim()).filter(Boolean) : [];
  // Prevent duplicates
  const lower = items.map(i => i.toLowerCase());
  if (lower.indexOf(name.toLowerCase()) === -1) {
    items.push(name);
  }
  return items.join(', ');
}



function markTokenUsed(token) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tokensSheet = ss.getSheetByName(CONFIG.tokensSheetName);
  if (!tokensSheet) return;
  const data = tokensSheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === token) {
      tokensSheet.getRange(r+1, 5).setValue(true);
      return;
    }
  }
}  

function invalidateTokensForRow(rowId){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tokensSheet = ss.getSheetByName(CONFIG.tokensSheetName);
  if (!tokensSheet) return;
  const data = tokensSheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][3] === rowId) {
      tokensSheet.getRange(r+1, 5).setValue(true);
    }
  }
}
