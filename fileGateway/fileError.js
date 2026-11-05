/**
 * fileGatewayErrors_v4.js — File Gateway project (FILE_GATEWAY_URL). Server side of the error-file editor in
 * resultsManagement.html. All actions are limited to files that sit in the upload folder.
 *
 * Script properties:
 *   RESULTS_UPLOAD_FOLDER_ID     the upload folder
 *   RACE_RESULTS_WEBAPP_URL      the Race Results web app (/exec) - only needed if a WebAppUrl constant does not exist here
 *
 * Wire-up (in the File Gateway's doPost, AFTER the token has been authorised and the payload parsed):
 *     const handled = errorFileAction_v4(payload.action, payload);
 *     if (handled !== undefined) return <your JSON response helper>(handled);
 * Errors are thrown as normal; the gateway's existing catch should return { error: message } (shared.js gw() reads that).
 * Saving and re-queuing change data: if the gateway has a role check, require editor for 'saveResultsFile' / 'requeueFile'.
 */
function errorFileAction_v4(action, p) {
  switch (action) {
    case 'listErrorFiles':   return efListErrorFiles_();
    case 'getResultsFile':   return efGetResultsFile_(p.fileId);
    case 'validateResults':  return efValidateResults_(p.rawData);
    case 'saveResultsFile':  return efSaveResultsFile_(p);
    case 'requeueFile':      return efRequeueFile_(p.fileId);
    default:                 return undefined;                    // not ours
  }
}

function efUploadFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('RESULTS_UPLOAD_FOLDER_ID');
  if (!id) throw new Error('RESULTS_UPLOAD_FOLDER_ID script property is not set');
  return DriveApp.getFolderById(id);
}

/** A file by id, only if it is directly inside the upload folder. */
function efFile_(fileId) {
  if (!fileId) throw new Error('fileId is required');
  const folderId = efUploadFolder_().getId();
  const f = DriveApp.getFileById(String(fileId));
  const parents = f.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return f;
  throw new Error('That file is no longer in the upload folder (it may already have been processed).');
}

function efListErrorFiles_() {
  const it = efUploadFolder_().getFiles(), files = [];
  while (it.hasNext()) {
    const f = it.next(), d = f.getDescription() || '';
    if (/error/i.test(d)) files.push({ id: f.getId(), name: f.getName(), description: d,
                                       created: f.getDateCreated().toISOString(), updated: f.getLastUpdated().getTime() });
  }
  files.sort((a, b) => a.created < b.created ? -1 : 1);
  return { success: true, files };
}

function efGetResultsFile_(fileId) {
  const f = efFile_(fileId);
  if (!/json/i.test(f.getMimeType()) && !/\.json$/i.test(f.getName()))
    throw new Error('Only JSON results files can be edited here. Use "Drive" to open this file.');
  let json;
  try { json = JSON.parse(f.getBlob().getDataAsString()); }
  catch (e) { throw new Error('The file is not valid JSON: ' + e.message); }
  return { success: true, fileId: f.getId(), name: f.getName(), description: f.getDescription() || '',
           updated: f.getLastUpdated().getTime(), json };
}

/** Same rules as the processor: asks the Race Results web app's read-only 'validate' action. */
function efValidateResults_(rawData) {
  if (!rawData || typeof rawData !== 'object') throw new Error('rawData is required');
  const url = (typeof WebAppUrl !== 'undefined' && WebAppUrl) ||
              PropertiesService.getScriptProperties().getProperty('RACE_RESULTS_WEBAPP_URL');
  if (!url) throw new Error('Race Results web app URL is not configured (RACE_RESULTS_WEBAPP_URL)');
  const resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ action: 'validate', rawData }), muteHttpExceptions: true
  });
  let res;
  try { res = JSON.parse(resp.getContentText()); }
  catch (e) { throw new Error('Validation service returned an unreadable response (HTTP ' + resp.getResponseCode() + ')'); }
  if (res.status !== 'success') throw new Error('Validation service failed: ' + (res.message || 'unknown error'));
  return { success: true, ok: res.errors.length === 0, errors: res.errors };
}

/**
 * Validate, then write the corrected JSON, clear the error and leave the file for the scheduler.
 * Nothing is written unless the file passes validation. The caller starts processing afterwards (triggerResults).
 */
function efSaveResultsFile_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Another save is in progress - try again in a moment.');
  try {
    const f = efFile_(p.fileId);
    if (p.expectedUpdated && Number(p.expectedUpdated) !== f.getLastUpdated().getTime())
      throw new Error('The file changed since you opened it. Close the editor and open it again.');

    // the editor corrects a file; it must not turn it into a different event
    let current; try { current = JSON.parse(f.getBlob().getDataAsString()); } catch (e) { current = null; }
    if (current && String(current.eventID).trim() !== String(p.rawData && p.rawData.eventID).trim())
      throw new Error('eventID cannot be changed.');

    const v = efValidateResults_(p.rawData);
    if (!v.ok) return v;                                           // nothing saved

    f.setContent(JSON.stringify(p.rawData, null, 2));
    f.setDescription('');                                          // no "error" -> getFileFromFolder picks it up again
    return { success: true, ok: true, errors: [] };
  } finally {
    lock.releaseLock();
  }
}

/** Re-queue unchanged (e.g. after a temporary failure): just clear the error. */
function efRequeueFile_(fileId) {
  const f = efFile_(fileId);
  f.setDescription('');
  return { success: true };
}