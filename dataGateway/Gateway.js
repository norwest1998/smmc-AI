// ── doGet ─────────────────────────────────────────────────────────
const OLDREGISTRY = [
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
        'Event Data': {key: "HexKey", headerRow: 1,headers: ["HexKey", " Month", " Date", " Start", " Finish", " Emblem", " Class", " Regatta Type", " Event Type", " Regional Conflicts", " Season", " Round no", " Calendar Synced", " Event", " Results", " Rescheduled Date"]}
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
        AuditLog: {key: "HexCode", headerRow: 1, headers: ["HexCode", "Timestamp", "User", "Action", "Domain", "Sheet", "Detail", "Old Value", "New Value", "Success"]},
        SchemaRegistry: {key: "Domain", headerRow: 1,headers: ["Domain","Sheet","Columns","Baseline Columns","Row Count","Last Checked","Status"]},
        VariableRegistry: {key: "Field Name", headerRow: 1,headers: ["Field Name", "Domain / SpreadsheetId", "Sheet", "Key Column", "Source Column", "Tag Notation","Last Refreshed"]}
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
      spreadsheetId: "1FqOMVZnUbTUtruE5QJ_dmscabdMU7BuEHTfjysNuC18",
      defaultSheet: "AvgScrReq",
      sheets: {
        AvgScrReq: {key: "Request ID", headerRow: 1,headers: ["Request ID","Timestamp","Member Name","Member Email","EventID","Date","Class","Regatta Type","Conflicting Regatta","Status","Rejected Reason","Decision By","Decision Date","Email Sent"]}
      }
    }
  },
  {
    results: {
      spreadsheetId: "1C7n5b1RZ1YCoQ3HHbZQ-UerJLbSfnZ_VYJnQ_CKr-XQ",
      defaultSheet: "GuestRegistrations",
      sheets: {
        AvgScrReq: {key: "HexKey", headerRow: 1,headers: ["HexKey", "EventID", "EventTitle", "EventDate", "RaceClass", "SailNo", "CompetitorName", "HomeClub", "ContactEmail", "RegisteredAt", "Status"]}
      }
    }
  }
];
function doGet(e) {
  const params = e ? e.parameter : {};
  const action = params.action || "getRegistry";
  return handleAction(action, params);
}

function doPost(e) {
  let payload = {};
  try {
    payload = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    payload = e ? e.parameter : {};
  }
  const action = payload.action || (e ? e.parameter.action : "registerSchema");
  return handleAction(action, payload);
}

function handleAction(action, payload) {
  try {
    let result;

    const updates = payload.updates || payload.update || {};
    const rowData = payload.rowData || {};
    const domain = payload.domain;
    const sheetName = payload.sheetName;

    const sheet       = getSheet(domain, sheetName);
    const allValues   = sheet.getDataRange().getValues();
    const config      = getSheetConfig(domain, sheetName);
    const headerRow   = (config?.headerRow ?? 1) - 1;           // 0-based index
    const regHeaders  = config?.headers ?? null;
    const keyField    = getKeyField(domain, sheetName);
    const headers     = regHeaders ?? allValues[headerRow].map(h => String(h).trim());
    const dataRows    = allValues.slice(headerRow + 1);         // rows after header
    const keyCol      = headers.indexOf(keyField);        
    let rows = null;

    switch (action) {
      case "getRegistry":
        const forceRefresh = payload.forceRefresh === true || payload.forceRefresh === "true";
        result = getSchemaRegistry(forceRefresh);
        break;

      case "registerSchema":
        // ACTION 1 & 3: Save schema, invalidate cache, and bump version checksum
        result = upsertSchemaRegistry(payload);
        break;

      case "layout":
        const layout = getSheetLayout(domain, sheetName);
        return json({success: true, domain: domain, sheetName: sheetName, layout: layout});

      case "fetch":
        rows = rowsToObjects(headers, dataRows, false);
        return json({ values: rows });

      case "append":
        const row = headers.map(h => rowData[h] ?? "");
        sheet.appendRow(row);
        if (domain !== "audit") auditLog("append", domain, sheetName, rowData[keyField] ?? "", "", "", rowData, "Success");
        return json({ success: true });

      case "update":
      case "delete":
        if (!keyField) return json({ error: "No key configured for this sheet" });
        if (keyCol === -1) return json({ error: `Key column "${keyField}" not found in headers` });

        const dataRowIndex = dataRows.findIndex(r => String(r[keyCol]).trim() === String(hexKey).trim());
        if (dataRowIndex === -1) return json({ error: `Record not found for key: ${hexKey}` });
        const sheetRowNumber = dataRowIndex + headerRow + 2;  // +1 for 1-based, +1 to skip header row

        if (action === "delete") {
          const before = Object.fromEntries(headers.map((h, i) => [h, dataRows[dataRowIndex][i]]));
          sheet.deleteRow(sheetRowNumber);
          if (domain !== "audit") auditLog("delete", domain, sheetName, hexKey, "", before, "", "Success");
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
            if (domain !== "audit") auditLog("update", domain, sheetName, hexKey, field, before, value, "Success");
            updatedCount++;
          }
        });
        return json({ success: true, updatedCount });

      case "listFolder":
        return listDriveFolder(payload.folderId);
      
      case "readFile":
        return readDriveFile(payload.fileId);

      case "triggerProcessing":
        return triggerResultsScheduler();

      case "batchFetch":
        if (!payload.requests) {
          result =  json({ error: "Missing 'requests' parameter" });
          break;
        }
        const batchReqs = JSON.parse(payload.requests);
        const batchResults = {};
        batchReqs.forEach(req => {
          try {
            const bSheet = getSheet(req.domain, req.sheet);
            const bAllValues = bSheet.getDataRange().getValues();
            const bConfig = getSheetConfig(req.domain, req.sheet);
            const bHeaderRow = (bConfig?.headerRow ?? 1) - 1;
            const bHeaders = bConfig?.headers ?? bAllValues[bHeaderRow].map(h => String(h).trim());
            const bDataValues = bAllValues.slice(bHeaderRow + 1);
            batchResults[req.domain + "|" + req.sheet] = rowsToObjects(bHeaders, bDataValues, false);
          } catch(err) {
            batchResults[req.domain + "|" + req.sheet] = [];
          }
        });
        result = json({ results: batchResults });
        break;

      default:
        throw new Error("Invalid or unsupported action: " + action);
    }
    if (!payload.domain) {
      return json({ error: 'Missing required "domain" parameter for this action.' });
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Registry Helpers ──────────────────────────────────────────────

function getRegistryEntry(domain) {
  const currentRegistry = getSystemRegistry(); // Call the cached getter
  const entry = currentRegistry.find(r => r && r[domain]);
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

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  return headers.map(String).map(h => h.trim()).filter(Boolean);
}

// ── Value Diff Checker ────────────────────────────────────────────

function isValueChanged(before, after) {
  if (before === after) return false;

  if (before instanceof Date) {
    const afterDate = new Date(after);
    if (!isNaN(afterDate.getTime())) {
      return before.getTime() !== afterDate.getTime();
    }
  }

  const strBefore = (before === null || before === undefined) ? "" : String(before).trim();
  const strAfter  = (after === null || after === undefined)   ? "" : String(after).trim();

  return strBefore !== strAfter;
}

// ── Audit Log ─────────────────────────────────────────────────────

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

function rowsToObjects(headers, values, skipFirst) {
  return (skipFirst ? values.slice(1) : values)
    .filter(r => r && r.some(c => c !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

// -- Store Average Score request -----------------------
function appendAverageScoreRequest(action, domain, sheet, rowData) {
  const entry = getRegistryEntry(domain);
  var ss = SpreadsheetApp.openById(entry.spreadsheetId); 
  var avgSheet = ss.getSheetByName("AvgScrReq");

  if (!avgSheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Sheet tab 'AvgScrReq' not found in spreadsheet."
    })).setMimeType(ContentService.MimeType.JSON);
  }
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

  avgSheet.appendRow(newRow);
  auditLog("append", domain, "AvgScrReq", rowData.requestId, `${action} by ${rowData.memberName}`, "", rowData, "Success");

  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "Request successfully created.",
    requestId: rowData.requestId
  })).setMimeType(ContentService.MimeType.JSON);

}

/**
 * Core System Registry Accessor
 * Preserves existing build logic while preventing stale cache overrides.
 */
function getSystemRegistry(forceRefresh) {
  const isForce = forceRefresh === true || forceRefresh === "true";
  const cache = CacheService.getScriptCache();
  const scriptProps = PropertiesService.getScriptProperties();
  
  const CACHE_KEY = "SYSTEM_REGISTRY_CACHE";
  const VERSION_KEY = "SCHEMA_VERSION";
  
  const currentVersion = scriptProps.getProperty(VERSION_KEY) || "0";

  // Return cached payload only if forceRefresh is false AND version matches
  if (!isForce) {
    const cachedStr = cache.get(CACHE_KEY);
    if (cachedStr) {
      try {
        const cachedPayload = JSON.parse(cachedStr);
        if (String(cachedPayload._version) === String(currentVersion)) {
          return cachedPayload.registry;
        }
      } catch (e) {
        console.warn("Corrupted registry cache encountered; re-compiling.");
      }
    }
  }

  // =========================================================
  // YOUR EXISTING REGISTRY BUILD LOGIC HERE
  // =========================================================
  // Keep whatever getSystemRegistry() currently executes 
  // (e.g., buildDynamicRegistryFromSheet(), loading sheets, parsing domains)
  const registry = buildDynamicRegistryFromSheet(); 
  // =========================================================

  // Cache fresh registry alongside current version checksum
  try {
    cache.put(CACHE_KEY, JSON.stringify({
      _version: currentVersion,
      registry: registry
    }), 21600); // 6 hours
  } catch (e) {
    console.warn("System registry size exceeds CacheService limit; bypassing cache storage.");
  }

  return registry;
}

function invalidateAndBumpRegistry() {
  const cache = CacheService.getScriptCache();
  cache.remove("SYSTEM_REGISTRY_CACHE");
  
  const newVersion = Date.now().toString();
  PropertiesService.getScriptProperties().setProperty("SCHEMA_VERSION", newVersion);
  return newVersion;
}

function buildDynamicRegistryFromSheet() {
  // Hardcode JUST the ID of the master CONFIG sheet (Audit Trail)
  const CONFIG_SPREADSHEET_ID = "1nRRzaJ_YBLZKyQbJ0oMQxg5ABRX-ODh3ioh-wVuQJSo"; 
  const ss = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID);

  const schemaSheet = ss.getSheetByName("SchemaRegistry");
  if (!schemaSheet) throw new Error("SchemaRegistry sheet not found.");

  const data = schemaSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  
  const domainIdx = headers.indexOf("domain");
  const sheetIdx = headers.indexOf("sheet");
  const colsIdx = headers.indexOf("columns");
  const ssIdIdx = headers.indexOf("spreadsheetid"); // New column in sheet
  const keyIdx = headers.indexOf("key field");      // New column in sheet
  const headerRowIdx = headers.indexOf("header row"); // New column in sheet

  const registryArray = [];
  const domainMap = {};

  for (let i = 1; i < data.length; i++) {
    const domain = String(data[i][domainIdx] || '').trim().toLowerCase();
    const sheetName = String(data[i][sheetIdx] || '').trim();
    const colsRaw = String(data[i][colsIdx] || '').trim();
    const spreadsheetId = String(data[i][ssIdIdx] || '').trim();
    const keyCol = String(data[i][keyIdx] || '').trim();
    const headerRow = parseInt(data[i][headerRowIdx]) || 1;

    if (!domain || !sheetName || !colsRaw || !spreadsheetId) continue;

    let columns = [];
    try { columns = JSON.parse(colsRaw); } 
    catch (e) { columns = colsRaw.split(',').map(c => c.trim()); }

    if (!domainMap[domain]) {
      domainMap[domain] = {
        spreadsheetId: spreadsheetId,
        defaultSheet: sheetName,
        sheets: {}
      };
    }

    domainMap[domain].sheets[sheetName] = {
      key: keyCol || columns[0], // Fallback to first col if blank
      headerRow: headerRow,
      headers: columns
    };
  }
  
  // Format exactly how the original const REGISTRY was formatted
  Object.keys(domainMap).forEach(domainKey => {
    registryArray.push({ [domainKey]: domainMap[domainKey] });
  });

  return registryArray;
}

function setupSchemaRegistry() {
  const REGISTRY_SHEET = "SchemaRegistry";
  const HEADERS = [
    "Domain", "Sheet", "Columns", "Baseline Columns",
    "Row Count", "Last Checked", "Status", "SpreadsheetId", "Key Field", "Header Row"
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

function upsertSchemaRegistry(payload) {
  const sheet     = setupSchemaRegistry();
  const domain    = (payload.domain  || "").toLowerCase();
  const sheetName = (payload.sheet   || "");
  const cols      = JSON.stringify(payload.columns  || []);
  const rowCount  = payload.rowCount || 0;
  const now       = new Date().toISOString();

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === domain && data[i][1] === sheetName) {
      const baseline = data[i][3] || cols;          
      const current  = data[i][2];
      const status   = (current && current !== cols) ? "DRIFT" : "OK";

      sheet.getRange(i + 1, 1, 1, 7).setValues([[
        domain, sheetName, cols, baseline, rowCount, now, status
      ]]);
      invalidateAndBumpRegistry();
      getSystemRegistry(true);
      return { ok: true, status };
    }
  }

  sheet.appendRow([domain, sheetName, cols, cols, rowCount, now, "OK"]);
  return { ok: true, status: "OK" };
}

function resetSchemaBaseline(domain, sheetName) {
  const regSheet = setupSchemaRegistry();
  const data = regSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === domain && data[i][1] === sheetName) {
      const current = data[i][2];
      regSheet.getRange(i + 1, 4).setValue(current); 
      regSheet.getRange(i + 1, 7).setValue("OK");    
      return { ok: true };
    }
  }
  return { ok: false, error: "Entry not found" };
}

function findResults(domain, sheetName, filtersArray) {
  const sheetConfig = getSheetConfig(domain, sheetName);
  if (!sheetConfig) {
    throw new Error(`Configuration not found for domain: ${domain}, sheet: ${sheetName}`);
  }

  const activeSheetName = sheetName || getRegistryEntry(domain)?.defaultSheet;
  const sheet = getSheet(domain, activeSheetName);
  const data = sheet.getDataRange().getValues();

  const headerIndex = (sheetConfig.headerRow || 1) - 1;
  const rawHeaders = data[headerIndex];
  if (!rawHeaders) {
    throw new Error(`Header row at index ${sheetConfig.headerRow} could not be found in the sheet.`);
  }

  const headers = rawHeaders.map(h => String(h).trim().toLowerCase());
  const rows = data.slice(headerIndex + 1);

  const filters = {};
  if (filtersArray) {
    let parsedFilters = filtersArray;
    if (typeof filtersArray === 'string') {
        try { parsedFilters = JSON.parse(filtersArray); } catch(e) {}
    }
    if (Array.isArray(parsedFilters)) {
        parsedFilters.forEach(f => { filters[f.key.toLowerCase()] = f.value; });
    }
  }

  const filteredRows = rows.filter(row => {
      return Object.entries(filters).every(([filterKey, filterValue]) => {
        const columnIndex = headers.indexOf(filterKey);
        if (columnIndex === -1) return false;
        return String(row[columnIndex]) === String(filterValue);
      });
  });

  return rowsToObjects(rawHeaders.map(h => String(h).trim()), filteredRows, false);
}

function validateRegistryAgainstLiveSheets() {
  const entry = getRegistryEntry("audit");
  const ss = SpreadsheetApp.openById(entry.spreadsheetId);
  const auditSheet = ss.getSheetByName('SchemaRegistry');
  if (!auditSheet) throw new Error("SchemaRegistry sheet not found.");

  const now = new Date().toISOString();
  const results = [];

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

  const headers = ["Domain", "Sheet", "Columns", "Baseline Columns", "Row Count", "Last Checked", "Status"];
  auditSheet.clear();
  auditSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  if (results.length > 0) {
    auditSheet.getRange(2, 1, results.length, headers.length).setValues(results);
  }

  generateVariableRegistry();
  Logger.log(`Validation complete. Processed ${results.length} sheets.`);
}

function generateVariableRegistry() {
  const entry = getRegistryEntry("audit");
  const ss = SpreadsheetApp.openById(entry.spreadsheetId);
  let sheet = ss.getSheetByName("VariableRegistry");

  const schemaSheet = ss.getSheetByName('SchemaRegistry');
  if (!schemaSheet) throw new Error("Sheet 'SchemaRegistry' not found in active spreadsheet.");
  
  const data = schemaSheet.getDataRange().getValues();
  if (data.length <= 1) return;
  
  const headers = data[0].map(h => String(h).trim());
  const domainIdx = headers.indexOf('Domain');
  const sheetIdx = headers.indexOf('Sheet');
  const colsIdx = headers.indexOf('Columns');
  const statusIdx = headers.indexOf('Status');

  const keyCandidates = ['RowID', 'ID', 'HexKey', 'Key', 'Batch Key', 'ActionID', 'NoteID', 'BoatID', 'TopicID'];
  const registryRows = [];
  const timestamp = new Date();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const domain = String(row[domainIdx] || '').trim();
    const sheetName = String(row[sheetIdx] || '').trim();
    const colsRaw = String(row[colsIdx] || '').trim();
    const status = statusIdx !== -1 ? String(row[statusIdx] || '').trim() : 'OK';

    if (!domain || !sheetName || !colsRaw || status === 'ERROR') continue;

    let columns = [];
    try {
      columns = JSON.parse(colsRaw);
    } catch (e) {
      columns = colsRaw.split(',').map(c => c.trim());
    }

    if (!Array.isArray(columns) || columns.length === 0) continue;

    let keyColumn = columns.find(col => keyCandidates.includes(col.trim()));
    if (!keyColumn) keyColumn = columns.find(col => /id|key/i.test(col.trim())) || columns[0];

    columns.forEach(colName => {
      const cleanCol = String(colName).trim();
      if (!cleanCol) return;

      const fieldTag = slugifyFieldName(cleanCol);
      registryRows.push([
        fieldTag, domain, sheetName, keyColumn, cleanCol, `${domain}.${fieldTag}`, timestamp
      ]);
    });
  }

  let varSheet = ss.getSheetByName('VariableRegistry');
  if (!varSheet) {
    varSheet = ss.insertSheet('VariableRegistry');
  } else {
    varSheet.clear();
  }

  const outputHeaders = ['Field Name', 'Domain / SpreadsheetId', 'Sheet', 'Key Column', 'Source Column', 'Tag Notation', 'Last Refreshed'];
  const fullData = [outputHeaders, ...registryRows];
  varSheet.getRange(1, 1, fullData.length, outputHeaders.length).setValues(fullData);
  formatVariableRegistrySheet(varSheet, fullData.length, outputHeaders.length);
}

function slugifyFieldName(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_]+/g, '-');
}

function formatVariableRegistrySheet(sheet, totalRows, totalCols) {
  const headerRange = sheet.getRange(1, 1, 1, totalCols);
  headerRange.setBackground('#1f2937').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (totalRows > 1) {
    sheet.getRange(2, 7, totalRows - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }
  for (let c = 1; c <= totalCols; c++) {
    sheet.autoResizeColumn(c);
  }
}