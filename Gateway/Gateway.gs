const REGISTRY = {
  members:   { spreadsheetIdProperty: 'GATEWAY_MEMBERS_SPREADSHEET_ID',   defaultSheet: 'Members' },
  documents: { spreadsheetIdProperty: 'GATEWAY_DOCUMENTS_SPREADSHEET_ID', defaultSheet: 'Documents' },
  calendar:  { spreadsheetIdProperty: 'GATEWAY_CALENDAR_SPREADSHEET_ID',  defaultSheet: 'Calendar' },
  apps:      { spreadsheetIdProperty: 'GATEWAY_APPS_SPREADSHEET_ID',      defaultSheet: 'Membership Applications' },
  clubs:     { spreadsheetIdProperty: 'GATEWAY_CLUBS_SPREADSHEET_ID',     defaultSheet: 'Club Management' },
  notes:     { spreadsheetIdProperty: 'GATEWAY_NOTES_SPREADSHEET_ID',     defaultSheet: 'Notes' },
  audit:     { spreadsheetIdProperty: 'GATEWAY_AUDIT_SPREADSHEET_ID',     defaultSheet: 'Audit Log' },
  tracking:  { spreadsheetIdProperty: 'GATEWAY_TRACKING_SPREADSHEET_ID',  defaultSheet: 'Tracking' }
};

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    return json(handleRequest_(params, null));
  } catch (err) {
    return json({ error: err && err.message ? err.message : String(err) }, 400);
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    return json(handleRequest_(payload, payload));
  } catch (err) {
    return json({ error: err && err.message ? err.message : String(err) }, 400);
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function handleRequest_(params, payload) {
  const action = String((params && params.action) || (payload && payload.action) || '').trim().toLowerCase();
  if (!action) {
    throw new Error('Missing action parameter.');
  }

  const domain = String((params && params.domain) || (payload && payload.domain) || '').trim().toLowerCase();
  const sheetName = (params && params.sheet) || (payload && payload.sheet) || '';
  const hexKey = (params && params.hexKey) || (payload && payload.hexKey) || null;

  const { sheet } = getDomainSheet_(domain, sheetName);

  switch (action) {
    case 'fetch':
      return sheet.getDataRange().getValues();

    case 'display':
      return { record: findRecordByKey_(sheet, hexKey) };

    case 'update':
      return updateRowByKey_(sheet, hexKey, (payload && payload.updates) || {});

    case 'append':
      return appendRowToSheet_(sheet, (payload && payload.rowData) || {});

    case 'delete':
      return deleteRowByKey_(sheet, hexKey);

    default:
      throw new Error('Unsupported action: ' + action);
  }
}

function getDomainSheet_(domain, sheetName) {
  const config = REGISTRY[String(domain || '').trim().toLowerCase()];
  if (!config) {
    throw new Error('Unknown domain: ' + domain);
  }

  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(config.spreadsheetIdProperty);
  if (!spreadsheetId) {
    throw new Error('Missing script property ' + config.spreadsheetIdProperty + ' for domain "' + domain + '".');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const targetSheetName = String(sheetName || config.defaultSheet || '').trim();
  const sheet = targetSheetName ? ss.getSheetByName(targetSheetName) : ss.getSheets()[0];

  if (!sheet) {
    throw new Error('Sheet "' + targetSheetName + '" not found in domain "' + domain + '".');
  }

  return { ss: ss, sheet: sheet };
}

function findRecordByKey_(sheet, hexKey) {
  if (!hexKey) {
    throw new Error('Missing hexKey for display.');
  }

  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return null;
  }

  const headers = normaliseHeaders_(values[0]);
  const keyIndex = findHeaderIndex_(headers, ['rowid', 'hexkey', 'hex key', 'row id', 'id']);
  if (keyIndex < 0) {
    return null;
  }

  const row = values.slice(1).find(function (r) {
    return String((r[keyIndex] !== undefined ? r[keyIndex] : '') || '').trim() === String(hexKey).trim();
  });

  if (!row) {
    return null;
  }

  return rowToObject_(headers, row);
}

function updateRowByKey_(sheet, hexKey, updates) {
  if (!hexKey) {
    throw new Error('Missing hexKey for update.');
  }

  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    throw new Error('No data in sheet for update.');
  }

  const headers = normaliseHeaders_(values[0]);
  const keyIndex = findHeaderIndex_(headers, ['rowid', 'hexkey', 'hex key', 'row id', 'id']);
  const targetRowIndex = values.slice(1).findIndex(function (row) {
    if (keyIndex < 0 || keyIndex >= row.length) {
      return false;
    }
    return String(row[keyIndex] || '').trim() === String(hexKey).trim();
  });

  if (targetRowIndex === -1) {
    throw new Error('Record not found for key: ' + hexKey);
  }

  const targetRowNumber = targetRowIndex + 2;
  Object.keys(updates || {}).forEach(function (fieldName) {
    const fieldIndex = findHeaderIndex_(headers, [fieldName]);
    if (fieldIndex >= 0) {
      sheet.getRange(targetRowNumber, fieldIndex + 1).setValue(updates[fieldName]);
    }
  });

  return { success: true };
}

function appendRowToSheet_(sheet, rowData) {
  const headers = getHeaders_(sheet);
  const row = headers.map(function (header) {
    return getValueForHeader_(rowData, header);
  });
  sheet.appendRow(row);
  return { success: true };
}

function deleteRowByKey_(sheet, hexKey) {
  if (!hexKey) {
    throw new Error('Missing hexKey for delete.');
  }

  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    throw new Error('No data in sheet for delete.');
  }

  const headers = normaliseHeaders_(values[0]);
  const keyIndex = findHeaderIndex_(headers, ['rowid', 'hexkey', 'hex key', 'row id', 'id']);
  const targetRowIndex = values.slice(1).findIndex(function (row) {
    if (keyIndex < 0 || keyIndex >= row.length) {
      return false;
    }
    return String(row[keyIndex] || '').trim() === String(hexKey).trim();
  });

  if (targetRowIndex === -1) {
    throw new Error('Record not found for key: ' + hexKey);
  }

  sheet.deleteRow(targetRowIndex + 2);
  return { success: true };
}

function getHeaders_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return [];
  }
  return normaliseHeaders_(values[0]);
}

function normaliseHeaders_(row) {
  return (row || []).map(function (header) {
    return String(header || '').trim();
  });
}

function rowToObject_(headers, row) {
  const record = {};
  headers.forEach(function (header, index) {
    record[header] = row[index];
  });
  return record;
}

function findHeaderIndex_(headers, candidateNames) {
  const normalisedCandidates = candidateNames.map(function (candidate) {
    return String(candidate || '').trim().toLowerCase();
  });

  return headers.findIndex(function (header) {
    const normalisedHeader = String(header || '').trim().toLowerCase();
    return normalisedCandidates.indexOf(normalisedHeader) !== -1;
  });
}

function getValueForHeader_(rowData, headerName) {
  const header = String(headerName || '').trim();
  const directMatch = Object.keys(rowData || {}).find(function (key) {
    return String(key || '').trim() === header;
  });
  if (directMatch) {
    return rowData[directMatch];
  }

  const caseInsensitiveMatch = Object.keys(rowData || {}).find(function (key) {
    return String(key || '').trim().toLowerCase() === header.toLowerCase();
  });
  if (caseInsensitiveMatch) {
    return rowData[caseInsensitiveMatch];
  }

  return '';
}

function json(payload, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
