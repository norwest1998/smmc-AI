// ── doGet ─────────────────────────────────────────────────────────
const REGISTRY = [
  {
    members: {
      spreadsheetId: "1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI",
      defaultSheet: "Members",
      sheets: {
        Members:      {key: "MemberID", headerRow: 1, headers: ["MemberID", "FirstName", "LastName", "Email", "Status"]},
        ClassMembers: {key: "BoatID", headerRow: 1, headers: ["BoatID","Active","Member","Class","SailNo","Model","Handicap","HRN","GH","GH HCap","Hull Colour","ClassId"]},
        Committee: {key: "Role", headerRow: 2, headers: ["Role","Member","Email","Phone #","Notify Member Application","Approve Member Application","Start of Term","End of Term","Constitutional Office Bearers"]},
        Classes: {key: "ClassID", headerRow: 1,headers: ["ClassID","ClassName","Coordinator","Restrictions","Handicap","Insignia"]},
        Regattas: {key: "ID",headerRow: 1, headers: ["ID","ChampionshipName","Class","RegattaType","WeekofMonth","Time","Hcap Formula","<4","<7","<13","13+"]}
      }
    }
  },
  {
    apps: {
      spreadsheetId: "1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk",
      defaultSheet: "Membership Applications",
      sheets: {
        'Membership Applications': {key: "Request ID", headerRow: 7, headers: ["Request ID", "ApplicantName", "DateSubmitted", "Status"]},
        Tokens: {key: "Token", headerRow: 1, headers: ["Token","Type","Committee","Row Index","Used","Expiry"]}
      } 
    }
  },
  {
    documents: {
      spreadsheetId: "1gE486zRLghLbnDXvY8duUcYuCyHoi9Jf1XwmrkT3sRs",
      defaultSheet: "Documents",
      sheets: {
        Documents: {key: "DocID", headerRow: 1,headers: ["DocID", "Title", "Category", "Url"]},
        DocumentVersions: {key: "RowID", headerRow: 1,headers: ["RowID","DocID","Version","DriveFileId","DriveLink","ChangedBy","ChangedDate","Notes"]}
      }
    }
  },
  {
    calendar: {
      spreadsheetId: "1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM",
      defaultSheet: "Event Data",
      sheets: {
        'Event Data': {key: "HexKey", headerRow: 1,headers: ["HexKey", "EventName", "Date", "Location"]},
      }
    }
  },
  {
    notes: {
      spreadsheetId: "1s9zOeaGiWEshpgWYJO_5VaF1OggvnM_b2mRVsotxcbs",
      defaultSheet: "Notes",
      sheets: {
        Notes: {key: "NoteID", headerRow: 1,headers: ["NoteID","Date","Topic","SubTopic","Note","Attachments","CopyIn","CreatedAt","LastUpdated"]},
        Actions: {key: "ActionID", headerRow: 1,headers: ["ActionID","NoteID","Action","ActionBy","DateBy","Member","Status","CreatedAt"]}, 
        Topics: {key: "TopicID", headerRow: 1,headers: ["TopicID","Topic","CreatedAt","NoteCount"]}
      }
    }
  },
  {
    audit: {
      spreadsheetId: "1nRRzaJ_YBLZKyQbJ0oMQxg5ABRX-ODh3ioh-wVuQJSo",
      defaultSheet: "AuditLog",
      sheets: {
        AuditLog: {key: "ActionID", headerRow: 1,headers: ["ActionID", "Timestamp", "User", "Action"]},
        SchemaRegistry: {key: "Domain", headerRow: 1,headers: ["Domain","Sheet","Columns","Baseline Columns","Row Count","Last Checked","Status"]},
        VariableRegistry: {key: "Field Name", headerRow: 1,headers: ["Field Name",	"Domain / SpreadsheetId",	"Sheet",	"Key Column",	"Source Column",	"Tag Notation","Last Refreshed"]}
      }
    }
  },
  {
    tracking: {
      spreadsheetId: "1T9Hojn4zW7C-2UXg8O8OYKcq_BRYqCHsgU2n3S1IW8o",
      defaultSheet: "Dashboard",
      sheets: {
        Dashboard: {key: "Key", headerRow: 1,headers: ["Key","Communication Title","Date sent","Requests sent","Responded","Update Responses","Email Responses","% Response","Updates made","Responses with updates","Quickest Response","Average Response","Last Response","Avg Response Days","Emails Opened","% Opened"]},
        Tracking: {key: "Batch Key", headerRow: 1,headers: ["Batch Key","Club","Contact Name","Contact Role","Email Status","Key","Date Sent","Date Updated","Response Days","Response Time","Email Response","Reminder Sent","Comments","Thread ID","Recipient Email","Date Opened","Open Count"]}
      }
    }
  },
  {
    requests: {
      spreadsheetId: "1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM",
      defaultSheet: "Event Data",
      sheets: {
        AvgScrReq: {key: "Request ID", headerRow: 1,headers: ["Request ID","Timestamp","Member Name","Member Email","EventID","Date","Class","Regatta Type","Conflicting Regatta","Status","Rejected Reason","Decision By","Decision Date","Email Sent"]}
      }
    }
  }
];

function doGet(e) {
  let action, domain, sheetName, hexKey, filtersArray;
  try {
    const params = e?.parameter || {};
    ({ action, domain, sheet: sheetName, hexKey, filtersArray } = params);
    let rows = null;
    const sheet       = getSheet(domain, sheetName);
    const allValues   = sheet.getDataRange().getValues();
    const config      = getSheetConfig(domain, sheetName);
    const headerRow   = (config?.headerRow ?? 1) - 1;          // 0-based index
    const regHeaders  = config?.headers ?? null;
    const keyField    = getKeyField(domain, sheetName);
    const headers     = regHeaders ?? allValues[headerRow].map(h => String(h).trim());
    const dataValues  = allValues.slice(headerRow + 1);         // rows after header
console.log("doGet Action: " + action + " Domain: " + domain + " Sheet: " + sheet);
    if (!sheet) {
      return json({ error: 'Missing required "sheetName" parameter.' });
     }

    switch (action) {
      case "layout":
        const layout = getSheetLayout(domain, sheet);
        return json({success: true, domain: domain, sheetName: sheet, layout: layout});

      case "fetch": 
        rows = rowsToObjects(headers, dataValues, false);
        return json({ values: rows });

      case "display": 
        if (!hexKey) return json({ error: "hexKey required for display" });
        if (!keyField) return json({ error: "No key configured for this sheet" });

        rows = rowsToObjects(headers, dataValues, false);
        const record = rows.find(r => String(r[keyField]).trim() === String(hexKey).trim());
        if (!record) return json({ error: "Record not found" });
        return json({ record });

      case "Search":
        results = findResults(domain, sheet, filtersArray);
        return json({ values: results });

      case "listFolder":
        return listDriveFolder(params.folderId);

      case "readFile":
        return readDriveFile(params.fileId);
      
      case "getRegistry":
        try {
          const registry = buildDynamicRegistryFromSheet();
          return ContentService.createTextOutput(JSON.stringify({ registry: registry }))
            .setMimeType(ContentService.MimeType.JSON);
        } catch (err) {
          return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
        }
  
      case "triggerProcessing":
        return triggerResultsScheduler();

      default:
        auditLog(action, domain, sheetName, hexKey, "", "Unknown action: " + action, "", "Failed");
        return json({ error: `Unknown action: ${action}` });
    } 

  } catch(err) {
    auditLog(action, domain, sheetName, hexKey, "",err.message, "", "Failed");
    return json({ error: err.message });
  }
}

// ── doPost ────────────────────────────────────────────────────────


function doPost(e) {
  let action, domain, sheetName, hexKey;
  try {
    const body    = JSON.parse(e?.postData?.contents || "{}");
    ({ action, domain, sheet: sheetName, hexKey } = body);
    
    const updates = body.updates || {};
    const rowData = body.rowData || {};

    const sheet       = getSheet(domain, sheetName);
    const allValues   = sheet.getDataRange().getValues();
    const config      = getSheetConfig(domain, sheetName);
    const headerRow   = (config?.headerRow ?? 1) - 1;           // 0-based index
    const regHeaders  = config?.headers ?? null;
    const keyField    = getKeyField(domain, sheetName);
    const headers     = regHeaders ?? allValues[headerRow].map(h => String(h).trim());
    const dataRows    = allValues.slice(headerRow + 1);          // rows after header
    const keyCol      = headers.indexOf(keyField);
console.log("doPost Action: " + action + " Domain: " + domain + " Sheet: " + sheet);
    switch (action) {
      case"append":
        const row = headers.map(h => rowData[h] ?? "");
        sheet.appendRow(row);
        if (!domain === "audit") auditLog("append", domain, sheetName, rowData[keyField] ?? "", "", "", rowData, "Success");
        return json({ success: true });

      case "update":
      case "delete" :
        if (!keyField) return json({ error: "No key configured for this sheet" });
        if (keyCol === -1) return json({ error: `Key column "${keyField}" not found in headers` });

        const dataRowIndex = dataRows.findIndex(r => String(r[keyCol]).trim() === String(hexKey).trim());
        if (dataRowIndex === -1) return json({ error: `Record not found for key: ${hexKey}` });
        const sheetRowNumber = dataRowIndex + headerRow + 2;  // +1 for 1-based, +1 to skip header row

        if (action === "delete") {
          const before = Object.fromEntries(headers.map((h, i) => [h, dataRows[dataRowIndex][i]]));
          sheet.deleteRow(sheetRowNumber);
          if (!domain === "audit") auditLog("delete", domain, sheetName, hexKey, "", before, "", "Success");
          return json({ success: true });
        } 

        // update — only modify cell & audit log if the value actually changed
        let updatedCount = 0;
        Object.entries(updates).forEach(([field, value]) => {
          const col = headers.indexOf(field);
          if (col === -1) return;

          const before = dataRows[dataRowIndex][col];

          if (isValueChanged(before, value)) {
            sheet.getRange(sheetRowNumber, col + 1).setValue(value);
            if (!domain === "audit") auditLog("update", domain, sheetName, hexKey, field, before, value, "Success");
            updatedCount++;
          }
        });
        return json({ success: true, updatedCount });
      case "registerSchema":
        return json(upsertSchemaRegistry(body));

      case "triggerProcessing":
        return triggerResultsScheduler();

      case "appendAvgScrReq":
        return appendAverageScoreRequest(action, domain, sheet, rowData);
        
      default:   
        auditLog(action, domain, sheetName, hexKey, "", "Unknown action" + action, "", "Failed");
        return json({ error: `Unknown action: ${action}` });
    }
  } catch(err) {
    auditLog(action, domain, sheetName, hexKey, "",err.message, "",  "Failed");
    return json({ error: err.message });
  }
}

// ── Registry Helpers ──────────────────────────────────────────────

function getRegistryEntry(domain) {
  const entry = REGISTRY.find(r => r && r[domain]);
  if (!entry) throw new Error(`Unknown domain: ${domain}`);
  return entry[domain];
}

function getSheet(domain, sheetName) {
  const entry = getRegistryEntry(domain);
  const targetSheet = sheetName || entry.defaultSheet;
  const sheet = SpreadsheetApp.openById(entry.spreadsheetId).getSheetByName(targetSheet);
  if (!sheet) throw new Error(`Sheet not found: ${targetSheet}`);
  return sheet;
}

function getSheetConfig(domain, sheetName) {
  const entry = getRegistryEntry(domain);
  const targetSheet = sheetName || entry.defaultSheet;
  return entry.sheets?.[targetSheet] ?? null;
}

function getKeyField(domain, sheetName) {
  return getSheetConfig(domain, sheetName)?.key ?? null;
}

function getRegistryHeaders(domain, sheetName) {
  return getSheetConfig(domain, sheetName)?.headers ?? null;
}

// ── Layout Scraper ───────────────────────────────────────────────────
function getSheetLayout(domain, sheetName) {
  // If your domains map to different Spreadsheet IDs, map them here:
  // const ss = getSpreadsheetForDomain(domain);
  const entry = getRegistryEntry(domain);
  const ss = entry.spreadsheetId;
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in domain "${domain}".`);
  }

  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    return [];
  }

  // Fetch the first row (column headers)
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  // Return non-empty string headers
  return headers.map(String).map(h => h.trim()).filter(Boolean);
}

// ── Value Diff Checker ────────────────────────────────────────────

function isValueChanged(before, after) {
  if (before === after) return false;

  // Handle Apps Script Date objects from getValues()
  if (before instanceof Date) {
    const afterDate = new Date(after);
    if (!isNaN(afterDate.getTime())) {
      return before.getTime() !== afterDate.getTime();
    }
  }

  // Normalize string comparisons to ignore type mismatches like 10 vs "10" or empty string vs null
  const strBefore = (before === null || before === undefined) ? "" : String(before).trim();
  const strAfter  = (after === null || after === undefined)   ? "" : String(after).trim();

  return strBefore !== strAfter;
}

// ── Audit Log ─────────────────────────────────────────────────────
// Log all updates, deletes and appends...
function auditLog(action, domain, sheetName, recordId, field, before, after, success) {
  try {
    const sh      = getSheet("audit", "AuditLog");
    const headers = getRegistryHeaders("audit", "AuditLog");
    const user    = Session.getActiveUser().getEmail() || "unknown";
    const entry   = {
      HexCode:    recordId,
      Timestamp:  new Date().toISOString(),
      User:       user,
      Action:     action,
      Domain:     domain,
      Sheet:      sheetName,
      Detail:     field,
      "Old Value": typeof before === "object" && before !== null ? JSON.stringify(before) : String(before ?? ""),
      "New Value": typeof after  === "object" && after !== null  ? JSON.stringify(after)  : String(after  ?? ""),
      Success:    success
    };
    sh.appendRow(headers.map(h => entry[h] ?? ""));
  } catch(e) {
    console.error("AuditLog failed:", e.message);
  }
}

// ── Response Helper ───────────────────────────────────────────────

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Row Mapping ───────────────────────────────────────────────────

function rowsToObjects(headers, values, skipFirst) {
  return (skipFirst ? values.slice(1) : values)
    .filter(r => r && r.some(c => c !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

// -- Store Average Score request -----------------------
function appendAverageScoreRequest(action, domain, sheet, rowData) {
  const entry = getRegistryEntry(domain);
  var ss = SpreadsheetApp.getActiveSpreadsheet(entry.spreadsheetId); 
  var sheet = ss.getSheetByName("AvgScrReq");

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Sheet tab 'AvgScrReq' not found in spreadsheet."
    })).setMimeType(ContentService.MimeType.JSON);
  }
  // Map payload fields to spreadsheet column layout
  var newRow = [
    rowData.requestId || "",
    rowData.timestamp || new Date().toISOString(),
    rowData.memberName || "",
    rowData.memberEmail || "",
    rowData.eventDate || "",
    rowData.boatClass || "",
    rowData.regattaType || "",
    rowData.eventName || "",
    rowData.conflictingRegatta || "",
    rowData.status || "Received",
    "", // Decision Date
    "", // Decision By
    ""  // Rejected Reason
  ];

  sheet.appendRow(newRow);
  auditLog("append", domain, sheet, payload.requestId, `${action} by ${rowData.memberName}`, "", rowData, "Success");

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "Request successfully created.",
    requestId: payload.requestId
  })).setMimeType(ContentService.MimeType.JSON);

}

function buildDynamicRegistryFromSheet() {
  const entry = getRegistryEntry("audit"); 
  const ss = SpreadsheetApp.openById(entry.spreadsheetId);

  const schemaSheet = ss.getSheetByName("SchemaRegistry");
  if (!schemaSheet) throw new Error("SchemaRegistry sheet not found.");

  const data = schemaSheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const domainIdx = headers.indexOf("domain");
  const sheetIdx = headers.indexOf("sheet");
  const colsIdx = headers.indexOf("columns");

  // Domain ID mapping for server-side openById calls
  const DOMAIN_IDS = {
    members: "1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI",
    documents: "1gE486zRLghLbnDXvY8duUcYuCyHoi9Jf1XwmrkT3sRs",
    calendar: "1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM",
    apps: "1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk",
    notes: "1s9zOeaGiWEshpgWYJO_5VaF1OggvnM_b2mRVsotxcbs",
    audit: "1nRRzaJ_YBLZKyQbJ0oMQxg5ABRX-ODh3ioh-wVuQJSo",
    tracking: "1T9Hojn4zW7C-2UXg8O8OYKcq_BRYqCHsgU2n3S1IW8o",
    results: "1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM"
  };

  const keyCandidates = ['RowID', 'ID', 'HexKey', 'Key', 'Batch Key', 'ActionID', 'NoteID', 'BoatID', 'TopicID', 'HexCode', 'Request ID'];
  const domainMap = {};

  for (let i = 1; i < data.length; i++) {
    const domain = String(data[i][domainIdx] || '').trim().toLowerCase();
    const sheetName = String(data[i][sheetIdx] || '').trim();
    const colsRaw = String(data[i][colsIdx] || '').trim();

    if (!domain || !sheetName || !colsRaw) continue;

    let columns = [];
    try { columns = JSON.parse(colsRaw); } catch (e) { columns = colsRaw.split(',').map(c => c.trim()); }

    if (!domainMap[domain]) {
      domainMap[domain] = {
        spreadsheetId: DOMAIN_IDS[domain] || "",
        defaultSheet: sheetName,
        sheets: {}
      };
    }

    let keyCol = columns.find(c => keyCandidates.includes(c.trim())) ||
                 columns.find(c => /id|key/i.test(c.trim())) ||
                 columns[0];

    domainMap[domain].sheets[sheetName] = {
      headers: columns,
      key: keyCol,
      headerRow: 1
    };
  }
  return Object.keys(domainMap).map(domainKey => ({
      [domainKey]: domainMap[domainKey]
    }));

}

// ------------------------------------------------------------
// SHEET SETUP
// Run once manually (or via an onOpen menu) to create the sheet
// with the correct headers if it doesn't exist.
// ------------------------------------------------------------
function setupSchemaRegistry() {
  const REGISTRY_SHEET = "SchemaRegistry";
  const HEADERS = [
    "Domain", "Sheet", "Columns", "Baseline Columns",
    "Row Count", "Last Checked", "Status"
  ];

  const entry = getRegistryEntry("audit"); 
  const ss = SpreadsheetApp.openById(entry.spreadsheetId);
  let sheet = ss.getSheetByName(REGISTRY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRY_SHEET);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ------------------------------------------------------------
// Shema Monitoring
// UPSERT  — called by the web-app doPost handler
// payload: { domain, sheet, columns: string[], rowCount: number }
// ------------------------------------------------------------
function upsertSchemaRegistry(payload) {
  const sheet     = setupSchemaRegistry();
  const domain    = (payload.domain  || "").toLowerCase();
  const sheetName = (payload.sheet   || "");
  const cols      = JSON.stringify(payload.columns  || []);
  const rowCount  = payload.rowCount || 0;
  const now       = new Date().toISOString();

  const data = sheet.getDataRange().getValues();
  // Row 0 is headers; find existing entry by domain+sheet
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === domain && data[i][1] === sheetName) {
      const baseline = data[i][3] || cols;          // keep original baseline
      const current  = data[i][2];
      const status   = (current && current !== cols) ? "DRIFT" : "OK";

      sheet.getRange(i + 1, 1, 1, 7).setValues([[
        domain, sheetName, cols, baseline, rowCount, now, status
      ]]);
      return { ok: true, status };
    }
  }

  // New entry — baseline = first snapshot
  sheet.appendRow([domain, sheetName, cols, cols, rowCount, now, "OK"]);
  return { ok: true, status: "OK" };
}

function resetSchemaBaseline(domain, sheetName) {
  const regSheet = setupSchemaRegistry();
  const data = regSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === domain && data[i][1] === sheetName) {
      const current = data[i][2];
      regSheet.getRange(i + 1, 4).setValue(current); // Baseline Columns
      regSheet.getRange(i + 1, 7).setValue("OK");    // Status
      return { ok: true };
    }
  }
  return { ok: false, error: "Entry not found" };
}

function findResults(domain, sheetName, filtersArray) {
  // 1. Fetch sheet configuration from registry
  const sheetConfig = getSheetConfig(domain, sheetName);
  if (!sheetConfig) {
    throw new Error(`Configuration not found for domain: ${domain}, sheet: ${sheetName}`);
  }

  const activeSheetName = sheetName || getRegistryEntry(domain)?.defaultSheet;
  const sheet = getSheet(domain, activeSheetName);
  const data = sheet.getDataRange().getValues();

  const headerIndex = sheetConfig.headerRow - 1;
  const rawHeaders = data[headerIndex];
  if (!rawHeaders) {
    throw new Error(`Header row at index ${sheetConfig.headerRow} could not be found in the sheet.`);
    }

  const headers = rawHeaders.map(h => String(h).trim().toLowerCase());
  const rows = data.slice(sheetConfig.headerRow);

  const filters = {};filtersArray.forEach(f => {filters[f.key.toLowerCase()] = f.value;});
  const filteredRows = rows.filter(
    row => {
      return Object.entries(filters).every(
        ([filterKey, filterValue]) => {
        const columnIndex = headers.indexOf(filterKey);
        // If the column doesn't exist in the sheet, skip filtering on it
        if (columnIndex === -1) return false;
        // Exact check against the cell content
        return row[columnIndex] === filterValue;
        }
      );
    }
  );

  return [rawHeaders, ...filteredRows];
}

/**
 * Runs a complete health check comparing live Google Sheets against REGISTRY.
 * Updates SchemaRegistry sheet and flags DRIFT or OK status.
 */
function validateRegistryAgainstLiveSheets() {
  const entry = getRegistryEntry("audit");
  const ss = SpreadsheetApp.openById(entry.spreadsheetId);
  const auditSheet = ss.getSheetByName('SchemaRegistry');
  if (!auditSheet) throw new Error("SchemaRegistry sheet not found.");

  const now = new Date().toISOString();
  const results = [];

  // Iterate over each domain in REGISTRY
  REGISTRY.forEach(domainObj => {
    const domainKey = Object.keys(domainObj)[0];
    const domainInfo = domainObj[domainKey];
    
    let targetSs;
    try {
      targetSs = SpreadsheetApp.openById(domainInfo.spreadsheetId);
    } catch (e) {
      Logger.log(`Failed to open spreadsheet for domain: ${domainKey}`);
      return;
    }

    Object.keys(domainInfo.sheets).forEach(sheetName => {
      const sheetConfig = domainInfo.sheets[sheetName];
      const gSheet = targetSs.getSheetByName(sheetName);

      if (!gSheet) {
        results.push([domainKey, sheetName, "[]", JSON.stringify(sheetConfig.headers), 0, now, "ERROR: Sheet Missing"]);
        return;
      }

      // Read actual column headers from headerRow
      const headerRowIndex = sheetConfig.headerRow || 1;
      const lastCol = gSheet.getLastColumn();
      const lastRow = gSheet.getLastRow();
      
      let liveHeaders = [];
      if (lastCol > 0 && lastRow >= headerRowIndex) {
        liveHeaders = gSheet.getRange(headerRowIndex, 1, 1, lastCol)
                            .getValues()[0]
                            .map(h => String(h).trim())
                            .filter(h => h !== '');
      }

      const expectedHeaders = sheetConfig.headers || [];
      const isDrift = JSON.stringify(liveHeaders) !== JSON.stringify(expectedHeaders);
      const status = isDrift ? 'DRIFT' : 'OK';

      results.push([
        domainKey,
        sheetName,
        JSON.stringify(liveHeaders),
        JSON.stringify(expectedHeaders),
        Math.max(0, lastRow - headerRowIndex),
        now,
        status
      ]);
    });
  });

  // Overwrite SchemaRegistry with fresh baseline audit
  const headers = ["Domain", "Sheet", "Columns", "Baseline Columns", "Row Count", "Last Checked", "Status"];
  auditSheet.clear();
  auditSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  if (results.length > 0) {
    auditSheet.getRange(2, 1, results.length, headers.length).setValues(results);
  }

  // Auto-refresh VariableRegistry if any drift was found
  generateVariableRegistry();
  
  Logger.log(`Validation complete. Processed ${results.length} sheets.`);
}

/**
 * Automatically populates/refreshes the 'VariableRegistry' sheet from 'SchemaRegistry'.
 * Maps registered sheet columns to ${field-name} substitution tags.
 */
function generateVariableRegistry() {
  const entry = getRegistryEntry("audit");
  const ss = SpreadsheetApp.openById(entry.spreadsheetId);
  let sheet = ss.getSheetByName("VariableRegistry");

  
  // 1. Fetch data from SchemaRegistry
  const schemaSheet = ss.getSheetByName('SchemaRegistry');
  if (!schemaSheet) {
    throw new Error("Sheet 'SchemaRegistry' not found in active spreadsheet.");
  }
  
  const data = schemaSheet.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log("No data found in SchemaRegistry.");
    return;
  }
  
  // Map headers to indexes
  const headers = data[0].map(h => String(h).trim());
  const domainIdx = headers.indexOf('Domain');
  const sheetIdx = headers.indexOf('Sheet');
  const colsIdx = headers.indexOf('Columns');
  const statusIdx = headers.indexOf('Status');

  if (domainIdx === -1 || sheetIdx === -1 || colsIdx === -1) {
    throw new Error("SchemaRegistry must contain 'Domain', 'Sheet', and 'Columns' headers.");
  }

  // Candidate names used to automatically identify primary key columns
  const keyCandidates = ['RowID', 'ID', 'HexKey', 'Key', 'Batch Key', 'ActionID', 'NoteID', 'BoatID', 'TopicID'];

  const registryRows = [];
  const timestamp = new Date();

  // 2. Process each registered sheet entry
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const domain = String(row[domainIdx] || '').trim();
    const sheetName = String(row[sheetIdx] || '').trim();
    const colsRaw = String(row[colsIdx] || '').trim();
    const status = statusIdx !== -1 ? String(row[statusIdx] || '').trim() : 'OK';

    // Skip empty or failing rows
    if (!domain || !sheetName || !colsRaw || status === 'ERROR') continue;

    // Parse column array (handles both JSON strings and comma-separated text)
    let columns = [];
    try {
      columns = JSON.parse(colsRaw);
    } catch (e) {
      columns = colsRaw.split(',').map(c => c.trim());
    }

    if (!Array.isArray(columns) || columns.length === 0) continue;

    // Infer primary key column
    let keyColumn = columns.find(col => keyCandidates.includes(col.trim()));
    if (!keyColumn) {
      // Fallback: match any column containing 'id' or 'key', otherwise default to first column
      keyColumn = columns.find(col => /id|key/i.test(col.trim())) || columns[0];
    }

    // 3. Map each column header into a substitution variable tag
    columns.forEach(colName => {
      const cleanCol = String(colName).trim();
      if (!cleanCol) return;

      const fieldTag = slugifyFieldName(cleanCol);

      registryRows.push([
        fieldTag,                // e.g. "first-name"
        domain,                  // e.g. "apps"
        sheetName,               // e.g. "Membership Applications"
        keyColumn,               // e.g. "RowID"
        cleanCol,                // e.g. "First name"
        `${domain}.${fieldTag}`, // Global scoped tag: e.g. "apps.first-name"
        timestamp
      ]);
    });
  }

  // 4. Create or clear the target 'VariableRegistry' sheet
  let varSheet = ss.getSheetByName('VariableRegistry');
  if (!varSheet) {
    varSheet = ss.insertSheet('VariableRegistry');
  } else {
    varSheet.clear();
  }

  // 5. Output header and populated variable rows
  const outputHeaders = [
    'Field Name', 
    'Domain / SpreadsheetId', 
    'Sheet', 
    'Key Column', 
    'Source Column', 
    'Tag Notation', 
    'Last Refreshed'
  ];

  const fullData = [outputHeaders, ...registryRows];
  varSheet.getRange(1, 1, fullData.length, outputHeaders.length).setValues(fullData);

  // 6. Apply header styling and column auto-resizing
  formatVariableRegistrySheet(varSheet, fullData.length, outputHeaders.length);

  Logger.log(`Successfully generated ${registryRows.length} variable tags in 'VariableRegistry'.`);
}

/**
 * Converts source column headers into clean, slugified substitution tags.
 * Examples:
 *   "First name"               -> "first-name"
 *   "Emergency Contact Number" -> "emergency-contact-number"
 *   "Turnaround \nTime"        -> "turnaround-time"
 */
function slugifyFieldName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // strip special characters
    .trim()
    .replace(/[\s_]+/g, '-');     // replace spaces/underscores with hyphens
}

/**
 * Applies header formatting, frozen rows, and column auto-sizing.
 */
function formatVariableRegistrySheet(sheet, totalRows, totalCols) {
  const headerRange = sheet.getRange(1, 1, 1, totalCols);
  headerRange.setBackground('#1f2937')
             .setFontColor('#ffffff')
             .setFontWeight('bold');

  sheet.setFrozenRows(1);

  if (totalRows > 1) {
    // Format timestamp column
    sheet.getRange(2, 7, totalRows - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }

  for (let c = 1; c <= totalCols; c++) {
    sheet.autoResizeColumn(c);
  }
}