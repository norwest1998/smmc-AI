const RESULTS_GATEWAY_URL = "https://script.google.com/macros/s/AKfycbwHYDa3Jg-4pojZ6zCeU_fT6Xc17Rwz_B3aFl7UbafDnb61UzuzI-uY3kagrSOo77L3/exec";

// Folder IDs
const FOLDERS = {
    upload:    "1kLfQOZYgzjLS5drf4bDX5q-vR3nhcTSI",
    processed: "1Ulparqx_-h8v6bUqgMGDyNBo-5tU5duR",
    overall:   "1c8YEM-I5wxkHMNXL658WEu2n5ylDYfuO",
    documents: "1h-nPRC_EH2G-SG8PqDWU0WXfTTpO4feM"

};

function doGet(e) {
    const action   = e.parameter.action;
    const folderKey = e.parameter.folder;   // "upload" | "processed" | "overall"
    const fileId   = e.parameter.fileId;

    try {
        switch (action) {
            case "listFolder": return listFolder(folderKey);
            case "readFile":   return readFile(fileId);
            case 'listErrorFiles':   return efListErrorFiles_();
            default:           return respond({ error: "Unknown action: " + action });
        }
    } catch(err) {
        return respond({ error: err.message });
    }
}

function doPost(e) {
    if (!verifyToken(e.parameter.token)) return respond({ success: false, code: "AUTH", error: "Unauthorized" });
    
    try {
        const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
        const claims = body.action ? verifyToken(body.token) : null;
        if (body.action && !claims)
            return respond({ success: false, code: "AUTH", error: "Unauthorized" });

        // error-file editor actions (fileGatewayErrors_v4.js)
        const handled = errorFileAction_v4(body.action, body, claims);
        if (handled !== undefined) return respond(handled);
        
        switch (body.action) {
            case "listFolder": return listFolder(body.folder);
            case "readFile":   return readFile(body.fileId);
            case "updateFile": return updateFile(body.fileId, body.data);
            case "uploadNew":  return uploadNew(body.folder, body.name, body.data, body.mimeType);
            case "fileMeta":      return fileMeta(body.fileId);
            case "archiveFile":   return archiveFile(body.fileId);
            case "listRecursive": return listRecursive(body.folderId);
            case "listChildren":  return listChildren(body.folderId);

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

function assertInAllowedFolder_(file) {
  const ok = Object.values(FOLDERS), ps = file.getParents();
  while (ps.hasNext()) if (ok.includes(ps.next().getId())) return;
  throw new Error("Forbidden");
}

function updateFile(fileId, b64) {
  if (!fileId || !b64) return respond({ error: "fileId and data required" });
  const file = DriveApp.getFileById(fileId);
  assertInAllowedFolder_(file);
  file.setContent(Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString("UTF-8"));
  return respond({ id: fileId, name: file.getName(), mimeType: file.getMimeType() });
}

function uploadNew(folderKey, name, b64, mimeType) {
  const folderId = FOLDERS[folderKey];
  if (!folderId) return respond({ error: "Unknown folder" });
  if (!name || !b64) return respond({ error: "name and data required" });
  const safeName = String(name).replace(/[\\\/:*?"<>|]/g, "_").slice(0, 200);
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType || "application/octet-stream", safeName);
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  return respond({ fileId: file.getId(), link: file.getUrl() });
}

function inDocsRoot_(id) {
  let cur = id;
  for (let i = 0; i < 12 && cur; i++) {
    if (cur === FOLDERS.documents) return true;
    cur = (Drive.Files.get(cur, { fields: "parents" }).parents || [])[0];
  }
  return false;
}
function assertInDocs_(id) {
  if (!/^[\w-]{10,}$/.test(String(id)) || !inDocsRoot_(id)) throw new Error("Forbidden");
}

function listChildren(folderId) {
  assertInDocs_(folderId);
  const r = Drive.Files.list({ q: `'${folderId}' in parents and trashed = false`,
                               fields: "files(id,name,mimeType,webViewLink)", pageSize: 1000 });
  return respond({ files: r.files || [] });
}

function fileMeta(fileId) {
  assertInDocs_(fileId);
  return respond(Drive.Files.get(fileId, { fields:
    "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents,description,version," +
    "lastModifyingUser(displayName,emailAddress),owners(displayName,emailAddress)" }));
}

function archiveFile(fileId) {
  assertInDocs_(fileId);
  const root = FOLDERS.documents;
  const q = `'${root}' in parents and name = 'Archive' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  let arch = (Drive.Files.list({ q, fields: "files(id)" }).files || [])[0];
  if (!arch) arch = Drive.Files.create({ name: "Archive", mimeType: "application/vnd.google-apps.folder", parents: [root] }, null, { fields: "id" });
  const prev = (Drive.Files.get(fileId, { fields: "parents" }).parents || []).join(",");
  Drive.Files.update({}, fileId, null, { addParents: arch.id, removeParents: prev });
  return respond({ success: true, archiveId: arch.id });
}

function listRecursive(rootId) {
  assertInDocs_(rootId);
  const out = [];
  (function scan(id, path) {
    let pageToken;
    do {
      const r = Drive.Files.list({ q: `'${id}' in parents and trashed = false`, pageToken,
        fields: "nextPageToken,files(id,name,mimeType,webViewLink)", pageSize: 1000 });
      (r.files || []).forEach(f => {
        if (f.mimeType === "application/vnd.google-apps.folder") scan(f.id, path ? path + "/" + f.name : f.name);
        else out.push(Object.assign(f, { category: path || "Root" }));
      });
      pageToken = r.nextPageToken;
    } while (pageToken);
  })(rootId, "");
  return respond({ files: out });
}