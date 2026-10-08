const RESULTS_GATEWAY_URL = "https://script.google.com/macros/s/AKfycbwHYDa3Jg-4pojZ6zCeU_fT6Xc17Rwz_B3aFl7UbafDnb61UzuzI-uY3kagrSOo77L3/exec";

// Folder IDs
const FOLDERS = {
    upload:    "1kLfQOZYgzjLS5drf4bDX5q-vR3nhcTSI",
    processed: "1Ulparqx_-h8v6bUqgMGDyNBo-5tU5duR",
    overall:   "1c8YEM-I5wxkHMNXL658WEu2n5ylDYfuO"
};

function doGet() { return respond({ error: "Use POST" }); }

function doPost(e) {
    try {
        const body = JSON.parse(e.postData.contents);
        const p = verifyToken(body.token);
        if (!p) return respond({ code: "AUTH", error: "Unauthorized" });
        if (p.role === "viewer") return respond({ error: "Forbidden" });
        if (body.action === "triggerProcessing" && p.role !== "admin") return respond({ error: "Forbidden" });

        switch (body.action) {
            case "listFolder":        return listFolder(body.folder);
            case "readFile":          return readFile(body.fileId);
            case "triggerProcessing": {
                const msg = triggerProcessing();   // must exist in this project
                return respond({ message: typeof msg === "string" ? msg : "Processing triggered." });
            }
            default: return respond({ error: "Unknown action: " + body.action });
        }
    } catch (err) {
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

    const ok = Object.values(FOLDERS), ps = file.getParents();
    let allowed = false;
    while (ps.hasNext()) if (ok.includes(ps.next().getId())) allowed = true;
    if (!allowed) return respond({ error: "Forbidden" });

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

function uploadFile(folderKey, filename, content) {
    try {
        const folderId = FOLDERS[folderKey] || folderKey;
        const folder = DriveApp.getFolderById(folderId);
        
        // Convert to string safely if object is passed 
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        
        // Create the file natively (application/json) 
        const blob = Utilities.newBlob(contentStr, 'application/json', filename);
        const file = folder.createFile(blob);
        
        return respond({ success: true, fileId: file.getId(), url: file.getUrl() });
    } catch (err) {
        return respond({ error: err.message });
    }
}

function respond(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}