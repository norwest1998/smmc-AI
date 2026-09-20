function doGet(e) {
  const sheetName = e && e.parameter ? e.parameter.sheet : null;
  if (!sheetName) {
    return json({ error: 'Missing sheet parameter' }, 400);
  }

  const sheet = getSheetByName(sheetName);
  if (!sheet) {
    return json({ error: 'Sheet not found: ' + sheetName }, 404);
  }

  return json(sheetToObjects(sheet));
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return json({ error: 'Invalid JSON payload: ' + err.message }, 400);
  }

  const action = payload.action;
  const sheetName = payload.sheet;

  if (!action) {
    return json({ error: 'Missing action' }, 400);
  }

  if (!sheetName) {
    return json({ error: 'Missing sheet name' }, 400);
  }

  const sheet = getSheetByName(sheetName);
  if (!sheet) {
    return json({ error: 'Sheet not found: ' + sheetName }, 404);
  }

  try {
    switch (action) {
      case 'fetch':
        return json(sheetToObjects(sheet));

      case 'append':
        return appendRow(sheet, payload.rowData || {});

      case 'update':
        return updateRow(sheet, payload.hexKey, payload.updates || {});

      case 'delete':
        return deleteRow(sheet, payload.hexKey);

      default:
        return json({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return json({ error: err && err.message ? err.message : String(err) }, 500);
  }
}

function getSheetByName(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss ? ss.getSheetByName(sheetName) : null;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) {
    return [];
  }

  const headers = values[0].map(function (header) {
    return String(header || '').trim();
  });

  return values.slice(1).filter(function (row) {
    return row.some(function (cell) {
      return String(cell || '').trim() !== '';
    });
  }).map(function (row) {
    const obj = {};
    headers.forEach(function (header, index) {
      obj[header] = row[index];
    });
    return obj;
  });
}

function appendRow(sheet, rowData) {
  const headers = getHeaders(sheet);
  const row = headers.map(function (header) {
    return getRowValue(rowData, header);
  });

  sheet.appendRow(row);
  return json({ status: 'success' });
}

function updateRow(sheet, hexKey, updates) {
  if (!hexKey) {
    return json({ error: 'Missing hexKey for update' }, 400);
  }

  const headers = getHeaders(sheet);
  const keyIndex = findKeyColumnIndex(headers);
  const data = sheet.getDataRange().getValues();
  const targetRowIndex = data.slice(1).findIndex(function (row) {
    if (keyIndex < 0 || keyIndex >= row.length) {
      return false;
    }
    return String(row[keyIndex] || '') === String(hexKey);
  });

  if (targetRowIndex === -1) {
    return json({ error: 'Record not found for key: ' + hexKey }, 404);
  }

  Object.keys(updates).forEach(function (fieldName) {
    const columnIndex = findHeaderIndex(headers, fieldName);
    if (columnIndex >= 0) {
      sheet.getRange(targetRowIndex + 2, columnIndex + 1).setValue(updates[fieldName]);
    }
  });

  return json({ status: 'success' });
}

function deleteRow(sheet, hexKey) {
  if (!hexKey) {
    return json({ error: 'Missing hexKey for delete' }, 400);
  }

  const headers = getHeaders(sheet);
  const keyIndex = findKeyColumnIndex(headers);
  const data = sheet.getDataRange().getValues();
  const targetRowIndex = data.slice(1).findIndex(function (row) {
    if (keyIndex < 0 || keyIndex >= row.length) {
      return false;
    }
    return String(row[keyIndex] || '') === String(hexKey);
  });

  if (targetRowIndex === -1) {
    return json({ error: 'Record not found for key: ' + hexKey }, 404);
  }

  sheet.deleteRow(targetRowIndex + 2);
  return json({ status: 'success' });
}

function getHeaders(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return [];
  }
  return values[0].map(function (header) {
    return String(header || '').trim();
  });
}

function findKeyColumnIndex(headers) {
  const keyCandidates = ['HexKey', 'HexCode', 'NoteID', 'ActionID', 'TopicID', 'ID'];
  return headers.findIndex(function (header) {
    const normalized = String(header || '').trim();
    return keyCandidates.some(function (candidate) {
      return normalized.toLowerCase() === candidate.toLowerCase();
    });
  });
}

function findHeaderIndex(headers, fieldName) {
  const normalizedField = String(fieldName || '').trim();
  return headers.findIndex(function (header) {
    return String(header || '').trim().toLowerCase() === normalizedField.toLowerCase();
  });
}

function getRowValue(rowData, headerName) {
  const target = String(headerName || '').trim();
  const direct = Object.keys(rowData).find(function (key) {
    return String(key || '').trim() === target;
  });
  if (direct) {
    return rowData[direct];
  }

  const matching = Object.keys(rowData).find(function (key) {
    return String(key || '').trim().toLowerCase() === target.toLowerCase();
  });
  if (matching) {
    return rowData[matching];
  }

  return '';
}

function json(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
