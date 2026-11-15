function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter.action;
  const sheetName = e.parameter.sheet;
  const className = e.parameter.className;

  console.log(action + " " + className);

  if (action === "query") {
    try {
      const result = queryMemberContactAgent(query);
      return json({ success: true, message: result });
    } catch (err) {
      return json({ error: err.message });
    }
  }
  
  // --- Member Management page data feeds ---
  if (action === "membersForManagement") {
    return json({ members: getMembersForPaidList() });
  }

  // --- Class Members for Results Capture ---
  if (action === "ClassMembers") {
    return json({ members: getClassMembersList(className) });
  }

  if (action === "activeMembers") {
    return json({ members: getMembers("active") });
  }

  if (action === "fetch") {
    return json(handleFetch(sheetName));
  }
  
  const hexCode = (e && e.parameter) ? (e.parameter.id || e.parameter.hexCode || e.parameter.code || "") : "";  
  if (hexCode){
    const template = HtmlService.createTemplateFromFile('Index');
    template.data = { hexCode: hexCode };
    
    return template.evaluate()
        .setTitle("SMMC Details Update")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else {
    memberList()
  }
}

function doPost(e) {
  try {
    return handlePost_(e);
  } catch (err) {
    return json({ error: "doPost: " + err.message });
  }
}

function handlePost_(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (body.action && !verifyToken(body.payload.token))   // markOpened stays public for the open-tracker
    return json({ success: false, code: "AUTH", error: "Unauthorized" });
 
  
  if (body.action === "query") {
    try {
      const result = queryMemberContactAgent(body.query);
      return json({ success: true, message: result });
    } catch (err) {
      return json({ error: err.message });
    }
  }

  if (body.action === 'updateMember') {
    return handleUpdateMember(body);
  }

  // --- Member Management actions (no body.sheet required) ---
  if (body.action === "markPaid") {
    try {
      const result = markPaid(body.row, body.isPaid);
      logAudit("markPaid", body.name || `Row ${body.row}`, "", body.isPaid, "success", result);
      return json({ success: true, message: result });
    } catch (err) {
      logAudit("markPaid", body.name || `Row ${body.row}`, "", "", "error", err.message);
      return json({ error: err.message });
    }
  }

  if (body.action === "updatePaidBatch") {
    try {
      const count = updatePaidMembersBatch(body.updates);
      // Log one row per member so each can be found by name in the audit log,
      // instead of a single aggregated "N member(s)" entry.
      (body.updates || []).forEach(u => {
        logAudit("updatePaidBatch", u.name || `Row ${u.row}`, "", u.isPaid, "success", "Bulk paid status update");
      });
      return json({ success: true, count });
    } catch (err) {
      logAudit("updatePaidBatch", "", "", "", "error", err.message);
      return json({ error: err.message });
    }
  }

  if (body.action === "sendUpdateRequest") {
    try {
      console.log("calling processEmailRequest");
      const result = processEmailRequest(body.row);
      console.log("back from processEmailRequest");
      return json(result);
    } catch (err) {
      logAudit("sendUpdateRequest", body.member && body.member.name, "", "", "error", err.message);
      return json({ error: `${err.message}` });
    }
  }

  if (body.action === "requestAllUpdates") {
    try {
      sendUpdateEmails(); // sendUpdateRequests(false) — logs one AuditLog row per member internally
      return json({ success: true });
    } catch (err) {
      logAudit("requestAllUpdates", "All active members", "", "", "error", err.message);
      return json({ error: err.message });
    }
  }

  if (body.action === "sendRenewals") {
    try {
      sendRenewEmails(); // sendUpdateRequests(true) — logs one AuditLog row per member internally
      return json({ success: true });
    } catch (err) {
      logAudit("sendRenewals", "All active members", "", "", "error", err.message);
      return json({ error: err.message });
    }
  }

  const sheet = ss.getSheetByName(body.sheet);

  if (body.action === "update") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const hexCol = headers.indexOf("HexKey") + 1;
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(r => r[hexCol - 1] === body.hexKey);
    if (rowIndex === -1) return json({ error: "HexKey not found" }, 404);

    Object.entries(body.updates).forEach(([field, value]) => {
      const col = headers.indexOf(field) + 1;
      if (col > 0) sheet.getRange(rowIndex + 1, col).setValue(value);
    });
    return json({ success: true });
  }

  if (body.action === "append") {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(h => body.rowData[h] ?? "");
    sheet.appendRow(row);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
}

function handleFetch(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh   = ss.getSheetByName(sheetName);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).trim());
  return data.slice(1)
    .filter(row => row.some(c => String(c).trim() !== ""))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = row[i] !== undefined ? row[i] : ""; });
      return obj;
    });
}   

// MAIN FRONTEND API CALL
function getInitialData(hexCode) {
  try {
    if (!hexCode) {
      return { status: "Error", message: "No security ID provided in link." };
    }

    const memberEmail = getEmailFromTrackingCode(hexCode);
    if (!memberEmail) {
      return { status: "Error", message: "Invalid or expired link code: " + hexCode };
    }

    const data = getMemberAndBoatData(memberEmail);
    if (!data || !data.member) {
      return { status: "Error", message: "No member record found for email: " + memberEmail };
    }

    const classList = getClasses();

    return {
      status: "Success",
      hexCode: hexCode,
      member: data.member,
      boats: data.boats || [],
      classes: classList || []
    };
  } catch (err) {
    return { status: "Error", message: "Server Error: " + err.toString() };
  }
}