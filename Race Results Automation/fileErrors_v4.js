/**
 * fileErrors_v4.js — orchestrator project (the one with checkAndProcessFile, WebAppUrl, createDelayTrigger).
 *
 * Script properties used:
 *   ADMIN_EMAIL                 optional; falls back to the effective user (the account the triggers run as)
 *   RESULTS_EDITOR_URL          resultsManagement web app URL; the editor receives ?fileId=<id>
 *   RESULTS_UPLOAD_FOLDER_ID    the upload folder
 */
const props_ = () => PropertiesService.getScriptProperties();
const adminEmail_ = () => props_().getProperty('ADMIN_EMAIL') || Session.getEffectiveUser().getEmail();

/** Marks a failed file ("error" in the description makes the scanner skip it) and emails a link to fix it. */
function markFileError_v4(file, msg) {
  const clean = String(msg).replace(/^(Error: )+/i, '').slice(0, 1500);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  file.setDescription(`Error: ${clean} (${stamp})`);
  try {
    const link = editorLink_v4(file);
    MailApp.sendEmail(adminEmail_(), 'SMMC results file needs attention: ' + file.getName(),
      `The results file "${file.getName()}" was not processed.\n\nReason:\n${clean}\n\nFix and re-submit: ${link}\n\n` +
      `The file stays in the upload folder and is skipped until the error is cleared (saving from the editor clears it).`);
  } catch (e) { Logger.log('Error email failed: ' + e.message); }
}

function editorLink_v4(file) {
  const base = props_().getProperty('RESULTS_EDITOR_URL');
  return base ? base + (base.indexOf('?') < 0 ? '?' : '&') + 'fileId=' + file.getId() : file.getUrl();
}

/** Files in the upload folder whose description contains "error". */
function listErrorFiles_v4() {
  const folderId = props_().getProperty('RESULTS_UPLOAD_FOLDER_ID');
  if (!folderId) throw new Error('RESULTS_UPLOAD_FOLDER_ID is not set');
  const it = DriveApp.getFolderById(folderId).getFiles(), out = [];
  while (it.hasNext()) {
    const f = it.next(), d = f.getDescription() || '';
    if (/error/i.test(d)) out.push({ id: f.getId(), name: f.getName(), reason: d, link: editorLink_v4(f), updated: f.getLastUpdated() });
  }
  return out;
}

/** Daily reminder while any file is still waiting for correction. */
function emailErrorFilesDigest_v4() {
  const list = listErrorFiles_v4();
  if (!list.length) return;
  MailApp.sendEmail(adminEmail_(), `SMMC: ${list.length} results file(s) awaiting correction`,
    list.map(f => `${f.name}\n  ${f.reason}\n  ${f.link}`).join('\n\n'));
}
function setupErrorDigestTrigger_v4() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'emailErrorFilesDigest_v4').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('emailErrorFilesDigest_v4').timeBased().everyDays(1).atHour(8).create();
}

/** Re-queue a file without editing it (e.g. after fixing an infrastructure problem). */
function requeueFile_v4(fileId) {
  DriveApp.getFileById(fileId).setDescription('');
  createDelayTrigger(1, 'checkAndProcessFile');
}

// ---------------------------------------------------------------------------------------------------------
// Server side for resultsManagement.html (the JSON editor) and for the file generator.
// ---------------------------------------------------------------------------------------------------------

function getResultsFileForEdit_v4(fileId) {
  const f = DriveApp.getFileById(fileId);
  return { fileId, name: f.getName(), error: f.getDescription() || '', json: JSON.parse(f.getBlob().getDataAsString()) };
}

/** Calls the web app's read-only validator. Returns { ok, errors }. Throws if the service itself fails. */
function validateResultsViaWebApp_v4(rawData) {
  const resp = UrlFetchApp.fetch(WebAppUrl, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ action: 'validate', rawData }), muteHttpExceptions: true
  });
  const res = JSON.parse(resp.getContentText());
  if (res.status !== 'success') throw new Error(res.message || 'Validation service failed');
  return { ok: res.errors.length === 0, errors: res.errors };
}

/** Editor save: validate first; only a valid file is written, its error cleared and processing queued. */
function saveResultsFileFromEditor_v4(fileId, rawData) {
  const v = validateResultsViaWebApp_v4(rawData);
  if (!v.ok) return v;                                         // nothing saved
  const f = DriveApp.getFileById(fileId);
  f.setContent(JSON.stringify(rawData, null, 2));
  f.setDescription('');
  createDelayTrigger(1, 'checkAndProcessFile');
  return { ok: true, errors: [] };
}