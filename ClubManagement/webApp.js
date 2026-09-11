function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter.action;
  const sheetName = e.parameter.sheet;

  if (action === "fetch") {
    const fetchSheet = ss.getSheetByName(sheetName);
    if (!fetchSheet) return json({ error: `Sheet not found: ${sheetName}` });
    const values = fetchSheet.getDataRange().getValues();
    return json({ values });
  }

  // --- Member Management page data feeds ---
  if (action === "membersForManagement") {
    return json({ members: getMembersForPaidList() });
  }

  if (action === "activeMembers") {
    return json({ members: getMembers("active") });
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
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Member Management actions (no body.sheet required) ---
  if (body.action === "markPaid") {
    try {
      const result = markPaid(body.row, body.isPaid);
      logAudit("markPaid", "Members", `Row ${body.row}`, "", body.isPaid, "success", result);
      return json({ success: true, message: result });
    } catch (err) {
      logAudit("markPaid", "Members", `Row ${body.row}`, "", body.isPaid, "error", err.message);
      return json({ error: err.message });
    }
  }

  if (body.action === "updatePaidBatch") {
    try {
      const count = updatePaidMembersBatch(body.updates);
      logAudit("updatePaidBatch", "Members", `${count} row(s)`, "", "", "success", `${count} member(s) updated`);
      return json({ success: true, count });
    } catch (err) {
      logAudit("updatePaidBatch", "Members", "", "", "", "error", err.message);
      return json({ error: err.message });
    }
  }

  if (body.action === "sendUpdateRequest") {
    try {
      const result = processEmailRequest(body.member);
      logAudit("sendUpdateRequest", "Members", body.member.email, "", "", "success", "Update request sent");
      return json(result);
    } catch (err) {
      logAudit("sendUpdateRequest", "Members", body.member && body.member.email, "", "", "error", err.message);
      return json({ error: err.message });
    }
  }

  if (body.action === "requestAllUpdates") {
    try {
      sendUpdateEmails(); // sendUpdateRequests(false)
      logAudit("requestAllUpdates", "Members", "All active", "", "", "success", "Update request sent to all active members");
      return json({ success: true });
    } catch (err) {
      logAudit("requestAllUpdates", "Members", "All active", "", "", "error", err.message);
      return json({ error: err.message });
    }
  }

  if (body.action === "sendRenewals") {
    try {
      sendRenewEmails(); // sendUpdateRequests(true)
      logAudit("sendRenewals", "Members", "All active", "", "", "success", "Renewal email sent to all active members");
      return json({ success: true });
    } catch (err) {
      logAudit("sendRenewals", "Members", "All active", "", "", "error", err.message);
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