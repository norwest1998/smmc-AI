// ── Spreadsheet Registry ──────────────────────────────────────────
const REGISTRY = [
  {
    "members": {
      "spreadsheetId": "1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI",
      "defaultSheet": "Members",
      "sheets": {
        "Members": {
          "headers": ["ID","Active","MemberName","Membership","Start Date","End Date","Paid up","Phone","email","WhatsApp","Duplicate","Address Line","Suburb","PCode","Emergency Contact Name","Emergency Contact Number","Calendar Subscription","Home Club","Committee"],
          "key": "ID",
          "headerRow": 1
        },
        "ClassMembers": {
          "headers": ["BoatID","Active","Member","Class","SailNo","Model","Handicap","HRN","GH","GH HCap","Hull Colour","ClassId"],
          "key": "BoatID",
          "headerRow": 1
        },
        "Regattas": {
          "headers": ["ID","ChampionshipName","Class","RegattaType","WeekofMonth","Time","Hcap Formula","<4","<7","<13","13+"],
          "key": "ID",
          "headerRow": 1
        },
        "Classes": {
          "headers": ["ClassID","ClassName","Coordinator","Restrictions","Handicap","Insignia"],
          "key": "ClassID",
          "headerRow": 1
        },
        "Committee": {
          "headers": ["Role","Member","Email","Phone #","Notify Member\nApplication","Approve Member\nApplication","Start of Term","End of Term","Constitutional Office Bearers"],
          "key": "Role",
          "headerRow": 2
        }
      }
    }
  },
  {
    "documents": {
      "spreadsheetId": "1gE486zRLghLbnDXvY8duUcYuCyHoi9Jf1XwmrkT3sRs",
      "defaultSheet": "Documents",
      "sheets": {
        "Documents": {
          "headers": ["RowID","Title","Category","Keywords","DriveFileId","DriveLink","Version","Status","Owner","LastModifiedBy","LastModifiedDate","ReviewedBy","ReviewDate","SignedOffBy","SignOffDate"],
          "key": "RowID",
          "headerRow": 1
        },
        "DocumentVersions": {
          "headers": ["RowID","DocID","Version","DriveFileId","DriveLink","ChangedBy","ChangedDate","Notes"],
          "key": "RowID",
          "headerRow": 1
        }
      }
    }
  },
  {
    "calendar": {
      "spreadsheetId": "1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM",
      "defaultSheet": "Event Data",
      "sheets": {
        "Event Data": {
          "headers": ["HexKey","Month","Date","Start","Finish","Emblem","Class","Regatta Type","Event Type","Regional Conflicts","Season","Round no","Calendar Synched","Event","Results","Rescheduled Date"],
          "key": "HexKey",
          "headerRow": 1
        }
      }
    }
  },
  {
    "apps": {
      "spreadsheetId": "1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk",
      "defaultSheet": "Membership Applications",
      "sheets": {
        "Membership Applications": {
          "headers": ["RowID","Status","Timestamp","Email address","First name","Surname","Address Line","Postal Code","Phone number","Emergency Contact","Emergency Contact Number","Membership Type","Name of Current Club","Nominating member name","Seconders member name","Nomination Date","Seconders Nomination Date","Membership Approved","Rejection Reason","Disclaimer","City","Reminder Date","Turnaround \nTime","Processed Notes","Comments","Votes For","Votes Against","LastStatusUpdated"],
          "key": "RowID",
          "headerRow": 7
        },
        "Tokens": {
          "headers": ["Token","Type","Committee","Row Index","Used","Expiry"],
          "key": "Token",
          "headerRow": 1
        }
      }
    }
  },
  {
    "notes": {
      "spreadsheetId": "1s9zOeaGiWEshpgWYJO_5VaF1OggvnM_b2mRVsotxcbs",
      "defaultSheet": "Notes",
      "sheets": {
        "Notes": {
          "headers": ["NoteID","Date","Topic","SubTopic","Note","Attachments","CopyIn","CreatedAt","LastUpdated"],
          "key": "NoteID",
          "headerRow": 1
        },
        "Actions": {
          "headers": ["ActionID","NoteID","Action","ActionBy","DateBy","Member","Status","CreatedAt"],
          "key": "ActionID",
          "headerRow": 1
        },
        "Topics": {
          "headers": ["TopicID","Topic","CreatedAt","NoteCount"],
          "key": "TopicID",
          "headerRow": 1
        }
      }
    }
  },
  {
    "audit": {
      "spreadsheetId": "1nRRzaJ_YBLZKyQbJ0oMQxg5ABRX-ODh3ioh-wVuQJSo",
      "defaultSheet": "AuditLog",
      "sheets": {
        "AuditLog": {
          "headers": ["HexCode","Timestamp","User","Action","Domain","Sheet","Detail","Old Value","New Value","Success"],
          "key": "HexCode",
          "headerRow": 1
        }
      }
    }
  },
  {
    "tracking": {
      "spreadsheetId": "1T9Hojn4zW7C-2UXg8O8OYKcq_BRYqCHsgU2n3S1IW8o",
      "defaultSheet": "Dashboard",
      "sheets": {
        "Dashboard": {
          "headers": ["Key","Communication Title","Date sent","Requests sent","Responded","Update Responses","Email Responses","% Response","Updates made","Responses with updates","Quickest Response","Average Response","Last Response","Avg Response Days","Emails Opened","% Opened"],
          "key": "Key",
          "headerRow": 1
        },
        "Tracking": {
          "headers": ["Batch Key","Club","Contact Name","Contact Role","Email Status","Key","Date Sent","Date Updated","Response Days","Response Time","Email Response","Reminder Sent","Comments","Thread ID","Recipient Email","Date Opened","Open Count"],
          "key": "Batch Key",
          "headerRow": 1
        }
      }
    }
  }
];

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

// ── doGet ─────────────────────────────────────────────────────────

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

    switch (action) {
      case"append":
        const row = headers.map(h => rowData[h] ?? "");
        sheet.appendRow(row);
        auditLog("append", domain, sheetName, rowData[keyField] ?? "", "", "", rowData, "Success");
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
          auditLog("delete", domain, sheetName, hexKey, "", before, "", "Success");
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
            auditLog("update", domain, sheetName, hexKey, field, before, value, "Success");
            updatedCount++;
          }
        });
        return json({ success: true, updatedCount });
      case "registerSchema":
        return jsonResponse(upsertSchemaRegistry(body));

      case "triggerProcessing":
        return triggerResultsScheduler();
        
      default:   
        auditLog(action, domain, sheetName, hexKey, "", "Unknown action" + action, "", "Failed");
        return json({ error: `Unknown action: ${action}` });
    }
  } catch(err) {
    auditLog(action, domain, sheetName, hexKey, "",err.message, "",  "Failed");
    return json({ error: err.message });
  }
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

  const ss = getSpreadsheet("audit"); // replace with however you look up your audit spreadsheet
  let sheet = ss.getSheetByName(REGISTRY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRY_SHEET);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ------------------------------------------------------------
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

// ------------------------------------------------------------
// READ  — fetch all registry rows (called via action=fetch on
//          domain=audit, sheet=SchemaRegistry, same as AuditLog)
// No extra gateway code needed if your existing fetch handler
// already reads any named sheet from the audit spreadsheet.
// ------------------------------------------------------------


// ------------------------------------------------------------
// RESET BASELINE  — call manually or via an admin button to
// accept the current columns as the new baseline (clears DRIFT)
// ------------------------------------------------------------
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
    throw new Error(Configuration not found for domain: ${domain}, sheet: ${sheetName});
  }
  // Resolve actual sheet name if default was used
  const activeSheetName = sheetName || getRegistryEntry(domain)?.defaultSheet;
  // 2. Fetch the spreadsheet data
  const sheet = getSheet(domain, activeSheetName);
  const data = sheet.getDataRange().getValues();
  // 3. Extract the exact header row based on config (converting 1-based index to 0-based)
  const headerIndex = sheetConfig.headerRow - 1;
  const rawHeaders = data[headerIndex];
  if (!rawHeaders) {throw new Error(Header row at index ${sheetConfig.headerRow} could not be found in the sheet.);}
  // Map headers to lowercase for flexible matching
  const headers = rawHeaders.map(h => String(h).trim().toLowerCase());
  // 4. Extract data rows (slice everything after the header row)
  const rows = data.slice(sheetConfig.headerRow);
  // 5. Transform filters array into a lookup object
  const filters = {};filtersArray.forEach(f => {filters[f.key.toLowerCase()] = f.value;});
  // 6. Filter the rows
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
  // 7. Return the data with the raw headers preserved at the top
  return [rawHeaders, ...filteredRows];
}

function listDriveFolder(folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const files = [];
    const it = folder.getFiles();
    while (it.hasNext()) {
        const f = it.next();
        files.push({
            id:          f.getId(),
            name:        f.getName(),
            createdTime: f.getDateCreated().toISOString(),
            description: f.getDescription() || ""
        });
    }
    return ContentService
        .createTextOutput(JSON.stringify({ files }))
        .setMimeType(ContentService.MimeType.JSON);
}

function readDriveFile(fileId) {
    const file    = DriveApp.getFileById(fileId);
    const content = JSON.parse(file.getBlob().getDataAsString());
    return ContentService
        .createTextOutput(JSON.stringify({ content }))
        .setMimeType(ContentService.MimeType.JSON);
}

function triggerResultsScheduler() {
    // Locate and run the scheduler function directly
    // (same as what the time-based trigger calls)
    ResultsScheduler(); // replace with your actual function name
    return ContentService
        .createTextOutput(JSON.stringify({ message: "Scheduler triggered." }))
        .setMimeType(ContentService.MimeType.JSON);
}