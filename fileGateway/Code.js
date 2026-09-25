function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action;
  const folderId = params.folderId || params.folder || "";
  const fileId = params.fileId || "";

  try {
    switch (action) {
      case "listFolder":
        return listDriveFolder(folderId);
      case "readFile":
        return readDriveFile(fileId);
      case "triggerProcessing":
        return triggerResultsScheduler();
      default:
        return json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return json({ error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : "{}");
    const action = body.action;

    switch (action) {
      case "triggerProcessing":
        return triggerResultsScheduler();
      default:
        return json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    return json({ error: err && err.message ? err.message : String(err) });
  }
}

function listDriveFolder(folderId) {
  if (!folderId) {
    return json({ error: "Missing folder id" });
  }

  const folder = DriveApp.getFolderById(folderId);
  const files = [];
  const it = folder.getFiles();

  while (it.hasNext()) {
    const file = it.next();
    files.push({
      id: file.getId(),
      name: file.getName(),
      createdTime: file.getDateCreated().toISOString(),
      description: file.getDescription() || ""
    });
  }

  return json({ files });
}

function readDriveFile(fileId) {
  if (!fileId) {
    return json({ error: "Missing file id" });
  }

  const file = DriveApp.getFileById(fileId);
  const rawText = file.getBlob().getDataAsString();

  let content;
  try {
    content = JSON.parse(rawText);
  } catch (err) {
    content = rawText;
  }

  return json({ content });
}

function triggerResultsScheduler() {
  if (typeof ResultsScheduler === "function") {
    ResultsScheduler();
    return json({ message: "Scheduler triggered." });
  }

  return json({ message: "Scheduler function not available in this project." });
}
