const RESULTS_GATEWAY_URL = "https://script.google.com/macros/s/AKfycbwHYDa3Jg-4pojZ6zCeU_fT6Xc17Rwz_B3aFl7UbafDnb61UzuzI-uY3kagrSOo77L3/exec";

// Folder IDs
const FOLDERS = {
    upload:    "1kLfQOZYgzjLS5drf4bDX5q-vR3nhcTSI",
    processed: "1Ulparqx_-h8v6bUqgMGDyNBo-5tU5duR",
    overall:   "1c8YEM-I5wxkHMNXL658WEu2n5ylDYfuO"
};

function doGet(e) {
    const action   = e.parameter.action;
    const folderKey = e.parameter.folder;   // "upload" | "processed" | "overall"
    const fileId   = e.parameter.fileId;

    try {
        switch (action) {
            case "listFolder": return listFolder(folderKey);
            case "readFile":   return readFile(fileId);
            default:           return respond({ error: "Unknown action: " + action });
        }
    } catch(err) {
        return respond({ error: err.message });
    }
}

function doPost(e) {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;

    try {
        switch (action) {
            case "listFolder": return listFolder(folderKey);
            case "readFile":   return readFile(fileId);
        }
    } catch(err) {
        return respond({ error: err.message });
    }
}

function listFolder(folderKey) {
    const folderId = FOLDERS[folderKey];
    if (!folderId) return respond({ error: "Unknown folder: " + folderKey });

    const folder = DriveApp.getFolderById(folderId);
    const files  = [];
    const it     = folder.getFiles();
    while (it.hasNext()) {
        const f = it.next();
        files.push({
            id:          f.getId(),
            name:        f.getName(),
            createdTime: f.getDateCreated().toISOString(),
            description: f.getDescription() || ""
        });
    }
    return respond({ files });
}

function readFile(fileId) {
    if (!fileId) return respond({ error: "fileId required" });
    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();

    // Google Sheet — read cell A1
    if (mimeType === MimeType.GOOGLE_SHEETS) {
        const ss = SpreadsheetApp.openById(fileId);
        const val = ss.getSheets()[0].getRange('A1').getValue();
        try {
            const content = JSON.parse(val);
            return respond({ content });
        } catch(e) {
            return respond({ error: "A1 content is not valid JSON: " + e.message });
        }
    }

    // Raw file (JSON/text blob)
    try {
        const text = file.getBlob().getDataAsString('UTF-8');
        const content = JSON.parse(text);
        return respond({ content });
    } catch(e) {
        return respond({ error: "File is not valid JSON: " + e.message });
    }
}

function oldreadFile(fileId) {
    if (!fileId) return respond({ error: "fileId required" });
    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();

    if (mimeType === MimeType.GOOGLE_SHEETS) {
        // Export first sheet as CSV via Drive export URL
        const exportUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=0`;
        const response  = UrlFetchApp.fetch(exportUrl, {
            headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
        });
        const csv  = response.getContentText();
        // A1 is the first cell of the first row
        const a1   = csv.split('\n')[0].split(',')[0].trim().replace(/^"|"$/g, '');
        try {
            const content = JSON.parse(a1);
            return respond({ content });
        } catch(e) {
            return respond({ error: "A1 content is not valid JSON: " + e.message });
        }
    }

    // Raw blob fallback
    try {
        const content = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
        return respond({ content });
    } catch(e) {
        return respond({ error: "File is not valid JSON: " + e.message });
    }
}

function respond(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}