/**
 * EMAIL MANAGEMENT SYSTEM (v2)
 * Bound to: "Email Management" spreadsheet
 * Recipients come from the "Contacts" sheet in the separate "Club Details" spreadsheet
 * (not just Primary Contact) so you can target President, Treasurer, Race Coordinator, etc.,
 * for all clubs or a chosen subset.
 *
 * Email bodies are authored in their own SHEET TABS ("templates") inside this spreadsheet,
 * so they can be reused/edited rather than retyped. Any sheet tab that is not one of the
 * reserved sheets below is treated as a template. Template layout:
 *   B1 = Subject
 *   A3 downward = body paragraphs (one paragraph per row, blank rows ignored)
 * Formatting applied directly to those cells in Google Sheets — bold, italic, underline,
 * strikethrough, font color, and hyperlinks (Insert > Link) — carries through into the
 * sent email. Unformatted cells send as plain text, same as before.
 *
 * RESERVED SHEETS (not treated as templates): Dashboard, Tracking, Audit_Log
 *
 * Tracking sheet header (v3 — adds dedicated Date Opened / Open Count columns so an
 * open isn't overwritten by a later reply; keeps everything from v2):
 *   Batch Key | Club | Contact Name | Contact Role | Email Status | Key | Date Sent |
 *   Date Updated | Response Days | Response Time | Email Response | Reminder Sent |
 *   Comments | Thread ID | Recipient Email | Date Opened | Open Count
 *
 * Dashboard and Audit_Log headers are unchanged from v1.
 */

// ---------- CONFIG ----------

const TRACKING_SHEET = 'Tracking';
const DASHBOARD_SHEET = 'Dashboard';
const AUDIT_SHEET = 'Audit_Log';
const CONTACTS_SHEET_NAME = 'Contacts';
const RESERVED_SHEETS = [TRACKING_SHEET, DASHBOARD_SHEET, AUDIT_SHEET];

// Tracking column numbers (1-indexed)
const TC = {
  BATCH_KEY: 1, CLUB: 2, CONTACT_NAME: 3, CONTACT_ROLE: 4, STATUS: 5, KEY: 6,
  DATE_SENT: 7, DATE_UPDATED: 8, RESPONSE_DAYS: 9, RESPONSE_TIME: 10,
  EMAIL_RESPONSE: 11, REMINDER_SENT: 12, COMMENTS: 13, THREAD_ID: 14, RECIPIENT_EMAIL: 15,
  DATE_OPENED: 16, OPEN_COUNT: 17
};

function getProp_(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function setProp_(key, value) { PropertiesService.getScriptProperties().setProperty(key, value); }

function getClubDetailsSpreadsheet_() {
  const id = getProp_('CLUB_DETAILS_SS_ID');
  if (!id) throw new Error('Club Details spreadsheet ID is not set. Use Email Manager > Settings first.');
  return SpreadsheetApp.openById(id);
}

// ---------- MENU ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📧 Email Manager')
    .addItem('Compose & Send Campaign', 'showComposeSidebar')
    .addSeparator()
    .addItem('Check Replies & Opens Now', 'checkRepliesAndOpens')
    .addItem('Enable Auto Reply-Check (every 30 min)', 'enableAutoCheckTrigger')
    .addItem('Disable Auto Reply-Check', 'disableAutoCheckTrigger')
    .addSeparator()
    .addItem('New Blank Template Sheet', 'createBlankTemplateSheet')
    .addItem('Settings', 'showSettingsDialog')
    .addToUi();
}

function showComposeSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Compose & Send Campaign');
  SpreadsheetApp.getUi().showSidebar(html);
}

function showSettingsDialog() {
  const ui = SpreadsheetApp.getUi();
  const currentId = getProp_('CLUB_DETAILS_SS_ID') || '';
  const idResp = ui.prompt('Settings: Club Details Spreadsheet',
    'Enter the Spreadsheet ID of "Club Details" (from its URL).\nCurrent: ' + (currentId || '(not set)'),
    ui.ButtonSet.OK_CANCEL);
  if (idResp.getSelectedButton() === ui.Button.OK) {
    const val = idResp.getResponseText().trim();
    if (val) setProp_('CLUB_DETAILS_SS_ID', val);
  }

  const currentUrl = getProp_('WEBAPP_URL') || '';
  const urlResp = ui.prompt('Settings: Web App URL (for open-tracking pixel)',
    'Deploy this script as a Web App (Deploy > New deployment > Web app, Execute as: Me, Access: Anyone), ' +
    'then paste the resulting URL here.\nCurrent: ' + (currentUrl || '(not set)'),
    ui.ButtonSet.OK_CANCEL);
  if (urlResp.getSelectedButton() === ui.Button.OK) {
    const val = urlResp.getResponseText().trim();
    if (val) setProp_('WEBAPP_URL', val);
  }

  const currentName = getProp_('SENDER_NAME') || '';
  const nameResp = ui.prompt('Settings: Sender Display Name',
    'Name to show as the "From" display name.\nCurrent: ' + (currentName || '(not set)'),
    ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() === ui.Button.OK) {
    const val = nameResp.getResponseText().trim();
    if (val) setProp_('SENDER_NAME', val);
  }
}

function createBlankTemplateSheet() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('New Template Sheet', 'Name for this email template (becomes the sheet tab name):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const name = resp.getResponseText().trim();
  if (!name) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(name)) { ui.alert('A sheet named "' + name + '" already exists.'); return; }
  const sh = ss.insertSheet(name);
  sh.getRange('A1').setValue('Subject:');
  sh.getRange('B1').setValue('Enter subject here');
  sh.getRange('A2').setValue('Body (one paragraph per row, from row 3 down). Bold/italic/underline/color/links carry through to the email:');
  sh.getRange('A3').setValue('Write your first paragraph here...');
  sh.getRange('A1:A2').setFontWeight('bold');
  sh.setColumnWidth(1, 500);
}

// ---------- HELPERS ----------

function nowKeySuffix_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss'); }

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found in this spreadsheet.');
  return sh;
}

function appendAuditLog_(key, club, sheetAffected, fieldInfo, oldValue, newValue) {
  getSheet_(AUDIT_SHEET).appendRow([key, new Date(), club, sheetAffected, fieldInfo, oldValue, newValue]);
}

function escapeForSearch_(str) { return str.replace(/"/g, '\\"'); }

function truthy_(v) {
  if (v === true) return true;
  const s = String(v || '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

// ---------- TEMPLATES ----------

function listTemplateSheetNames_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .map(s => s.getName())
    .filter(name => RESERVED_SHEETS.indexOf(name) === -1);
}

function readTemplate_(sheetName) {
  const sh = getSheet_(sheetName);
  const subject = String(sh.getRange('B1').getValue() || '').trim();
  const lastRow = sh.getLastRow();
  const textParagraphs = [];
  const htmlParagraphs = [];

  if (lastRow >= 3) {
    const range = sh.getRange(3, 1, lastRow - 2, 1);
    const values = range.getValues();
    const richValues = range.getRichTextValues();
    for (let i = 0; i < values.length; i++) {
      const plain = String(values[i][0] || '').trim();
      if (!plain) continue; // blank row = paragraph break, skip
      textParagraphs.push(plain);
      htmlParagraphs.push(richTextToHtml_(richValues[i][0]));
    }
  }

  return {
    subject: subject,
    bodyText: textParagraphs.join('\n\n'),
    bodyHtml: htmlParagraphs.join('<br><br>')
  };
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Converts a single cell's RichTextValue into an HTML string, preserving
 * bold, italic, underline, strikethrough, font color, and hyperlinks.
 * Falls back to plain escaped text if no rich text is present.
 */
function richTextToHtml_(richTextValue) {
  if (!richTextValue) return '';
  const fullText = richTextValue.getText();
  if (!fullText) return '';

  let runs;
  try {
    runs = richTextValue.getRuns();
  } catch (err) {
    return escapeHtml_(fullText).replace(/\n/g, '<br>');
  }

  if (!runs || runs.length === 0) {
    return escapeHtml_(fullText).replace(/\n/g, '<br>');
  }

  return runs.map(run => {
    const text = run.getText();
    if (!text) return '';
    let html = escapeHtml_(text).replace(/\n/g, '<br>');

    let style = null;
    try { style = run.getTextStyle(); } catch (err) { /* no style */ }

    if (style) {
      if (style.isStrikethrough && style.isStrikethrough()) html = '<s>' + html + '</s>';
      if (style.isUnderline && style.isUnderline()) html = '<u>' + html + '</u>';
      if (style.isItalic && style.isItalic()) html = '<em>' + html + '</em>';
      if (style.isBold && style.isBold()) html = '<strong>' + html + '</strong>';

      let color = null;
      try { color = style.getForegroundColor && style.getForegroundColor(); } catch (err) { /* ignore */ }
      if (color && color.toLowerCase() !== '#000000') {
        html = '<span style="color:' + color + '">' + html + '</span>';
      }
    }

    let linkUrl = null;
    try { linkUrl = run.getLinkUrl(); } catch (err) { /* not all versions support this on runs */ }
    if (linkUrl) {
      html = '<a href="' + escapeHtml_(linkUrl) + '" style="color:#1155cc;">' + html + '</a>';
    }

    return html;
  }).join('');
}

/** Called from Sidebar.html to populate the form */
function getComposeOptions() {
  const contactsSs = getClubDetailsSpreadsheet_();
  const contactsSheet = contactsSs.getSheetByName(CONTACTS_SHEET_NAME);
  if (!contactsSheet) throw new Error('"Contacts" sheet not found in Club Details spreadsheet.');

  const data = contactsSheet.getDataRange().getValues();
  // Columns: 0 Club Code, 1 NSWRYA Club, 2 Primary Contact(flag), 3 Contact Role,
  //          4 Contact Name, 5 Contact Mail, 6 Contact Phone
  const rolesSet = {};
  const clubsMap = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] && !row[1]) continue;
    const role = String(row[3] || '').trim();
    if (role) rolesSet[role] = true;
    clubsMap[row[0]] = row[1];
  }

  const roles = Object.keys(rolesSet).sort();
  const clubs = Object.keys(clubsMap).map(code => ({ code: code, name: clubsMap[code] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { roles: roles, clubs: clubs, templates: listTemplateSheetNames_(), myEmail: Session.getActiveUser().getEmail() };
}

/** Called from Sidebar.html when the user picks a template, to preview it */
function loadTemplate(sheetName) {
  return readTemplate_(sheetName);
}

// ---------- TEST SEND ----------

/**
 * Sends a one-off test email so the user can see exactly how it will render,
 * without creating any Tracking/Dashboard/Audit_Log rows tied to a real batch.
 * form = { templateName, subjectOverride, testEmail }
 */
function sendTestEmail(form) {
  const testEmail = (form.testEmail || '').trim();
  if (!testEmail || testEmail.indexOf('@') === -1) throw new Error('Enter a valid email address to send the test to.');

  const templateName = form.templateName;
  if (!templateName) throw new Error('Choose a template first.');
  const template = readTemplate_(templateName);

  const subject = (form.subjectOverride && form.subjectOverride.trim()) || template.subject;
  if (!subject) throw new Error('No subject: set one in the template (cell B1) or type an override.');
  if (!template.bodyText) throw new Error('Template "' + templateName + '" has no body content (from row 3 down).');

  const senderName = getProp_('SENDER_NAME') || 'Club Communications';
  const webAppUrl = getProp_('WEBAPP_URL');

  let htmlBody = template.bodyHtml;
  if (webAppUrl) {
    // Uses a key prefixed TEST- that will never match a real Tracking row, so opening
    // the test email does not affect any stats — but the pixel is still present, giving
    // a true preview of exactly what the real email will contain.
    const testKey = 'TEST-' + Utilities.getUuid();
    const pixelUrl = webAppUrl + '?key=' + encodeURIComponent(testKey) + '&t=' + new Date().getTime();
    htmlBody += '<img src="' + pixelUrl + '" width="1" height="1" style="display:none" alt="">';
  }

  GmailApp.sendEmail(testEmail, '[TEST] ' + subject, template.bodyText, { htmlBody: htmlBody, name: senderName });

  appendAuditLog_('TEST', 'N/A', 'Test Send', templateName, '', 'Sent test to ' + testEmail);

  return { sentTo: testEmail };
}

// ---------- RECIPIENT FILTERING (shared by preview + send) ----------

/**
 * filters = { roles: [...] | 'ALL', primaryOnly: bool, clubs: [...codes] | 'ALL' }
 * returns array of { clubCode, clubName, contactName, contactRole, email }
 */
function getFilteredRecipients_(filters) {
  const contactsSs = getClubDetailsSpreadsheet_();
  const contactsSheet = contactsSs.getSheetByName(CONTACTS_SHEET_NAME);
  const data = contactsSheet.getDataRange().getValues();

  const roleFilter = (filters.roles === 'ALL' || !filters.roles) ? null : new Set(filters.roles);
  const clubFilter = (filters.clubs === 'ALL' || !filters.clubs) ? null : new Set(filters.clubs);
  const primaryOnly = !!filters.primaryOnly;

  const results = [];
  const seenEmails = new Set();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const clubCode = row[0], clubName = row[1], isPrimary = row[2], role = String(row[3] || '').trim();
    const contactName = row[4], email = String(row[5] || '').trim();

    if (!clubCode && !clubName) continue;
    if (!email || email.indexOf('@') === -1) continue;
    if (roleFilter && !roleFilter.has(role)) continue;
    if (clubFilter && !clubFilter.has(clubCode)) continue;
    if (primaryOnly && !truthy_(isPrimary)) continue;

    const dedupeKey = clubCode + '|' + email.toLowerCase();
    if (seenEmails.has(dedupeKey)) continue; // avoid double-emailing same person for same club
    seenEmails.add(dedupeKey);

    results.push({ clubCode: clubCode, clubName: clubName, contactName: contactName, contactRole: role, email: email });
  }
  return results;
}

/** Called from Sidebar.html for a "how many will this send to" preview */
function previewRecipients(filters) {
  const recipients = getFilteredRecipients_(filters);
  return {
    count: recipients.length,
    sample: recipients.slice(0, 8).map(r => r.clubName + ' — ' + r.contactName + ' (' + r.contactRole + ')')
  };
}

// ---------- SEND CAMPAIGN ----------

/**
 * form = { templateName, subjectOverride, title, roles, primaryOnly, clubs }
 */
function sendCampaign(form) {
  const templateName = form.templateName;
  if (!templateName) throw new Error('Choose a template.');
  const template = readTemplate_(templateName);

  const subject = (form.subjectOverride && form.subjectOverride.trim()) || template.subject;
  if (!subject) throw new Error('No subject: set one in the template (cell B1) or type an override.');
  if (!template.bodyText) throw new Error('Template "' + templateName + '" has no body content (from row 3 down).');

  const title = (form.title && form.title.trim()) || templateName;
  const senderName = getProp_('SENDER_NAME') || 'Club Communications';
  const webAppUrl = getProp_('WEBAPP_URL');

  const recipients = getFilteredRecipients_({ roles: form.roles, primaryOnly: form.primaryOnly, clubs: form.clubs });
  if (recipients.length === 0) throw new Error('No recipients match the selected filters.');

  const batchKey = 'B-' + nowKeySuffix_();
  const trackingSheet = getSheet_(TRACKING_SHEET);
  let sentCount = 0, skippedCount = 0;
  const rowsToAppend = [];

  recipients.forEach(r => {
    const individualKey = batchKey + '-' + r.clubCode + '-' + Utilities.getUuid().substring(0, 8);
    let htmlBody = template.bodyHtml;
    if (webAppUrl) {
      const pixelUrl = webAppUrl + '?key=' + encodeURIComponent(individualKey) + '&t=' + new Date().getTime();
      htmlBody += '<img src="' + pixelUrl + '" width="1" height="1" style="display:none" alt="">';
    }

    try {
      GmailApp.sendEmail(r.email, subject, template.bodyText, { htmlBody: htmlBody, name: senderName });
    } catch (err) {
      skippedCount++;
      return;
    }

    let threadId = '';
    try {
      const searchQuery = 'to:"' + r.email + '" subject:"' + escapeForSearch_(subject) + '" newer_than:1d';
      const threads = GmailApp.search(searchQuery, 0, 1);
      if (threads.length > 0) threadId = threads[0].getId();
    } catch (err) { /* non-fatal */ }

    rowsToAppend.push([
      batchKey, r.clubName, r.contactName, r.contactRole, 'Sent', individualKey,
      new Date(), '', '', '', '', 'No', '', threadId, r.email, '', 0
    ]);
    sentCount++;
  });

  if (rowsToAppend.length > 0) {
    trackingSheet.getRange(trackingSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }

  upsertDashboardRow_(batchKey, title, new Date());
  refreshDashboardStats_(batchKey);
  appendAuditLog_(batchKey, 'ALL', TRACKING_SHEET, 'Batch Send (' + templateName + ')', '', sentCount + ' sent, ' + skippedCount + ' skipped');

  return { batchKey: batchKey, sent: sentCount, skipped: skippedCount };
}

// ---------- DASHBOARD ----------
// Dashboard header (v2 — adds "Emails Opened" and "% Opened" at the end):
//   Key | Communication Title | Date sent | Requests sent | Responded | Update Responses |
//   Email Responses | % Response | Updates made | Responses with updates | Quickest Response |
//   Average Response | Last Response | Avg Response Days | Emails Opened | % Opened

function upsertDashboardRow_(batchKey, communicationTitle, dateSent) {
  const sh = getSheet_(DASHBOARD_SHEET);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { if (data[i][0] === batchKey) return; }
  sh.appendRow([batchKey, communicationTitle, dateSent, 0, 0, 0, 0, 0, 0, 0, '', '', '', '', 0, 0]);
}

function refreshDashboardStats_(batchKey) {
  const dashSh = getSheet_(DASHBOARD_SHEET);
  const trackData = getSheet_(TRACKING_SHEET).getDataRange().getValues();
  const dashData = dashSh.getDataRange().getValues();

  let rowIdx = -1;
  for (let i = 1; i < dashData.length; i++) { if (dashData[i][0] === batchKey) { rowIdx = i; break; } }
  if (rowIdx === -1) return;

  let requestsSent = 0, responded = 0, emailResponses = 0, opened = 0;
  let responseDaysList = [];
  let lastResponse = null;

  for (let i = 1; i < trackData.length; i++) {
    if (trackData[i][TC.BATCH_KEY - 1] !== batchKey) continue;
    requestsSent++;
    const status = trackData[i][TC.STATUS - 1];
    const respDays = trackData[i][TC.RESPONSE_DAYS - 1];
    if (trackData[i][TC.DATE_OPENED - 1]) opened++; // counts opens even if since Responded
    if (status === 'Responded') {
      responded++; emailResponses++;
      if (respDays !== '' && !isNaN(respDays)) responseDaysList.push(Number(respDays));
      const dateUpdated = trackData[i][TC.DATE_UPDATED - 1];
      if (dateUpdated && (!lastResponse || dateUpdated > lastResponse)) lastResponse = dateUpdated;
    }
  }

  const pctResponse = requestsSent > 0 ? (responded / requestsSent) : 0;
  const pctOpened = requestsSent > 0 ? (opened / requestsSent) : 0;
  const quickest = responseDaysList.length ? Math.min.apply(null, responseDaysList) : '';
  const average = responseDaysList.length ? (responseDaysList.reduce((a, b) => a + b, 0) / responseDaysList.length) : '';

  dashSh.getRange(rowIdx + 1, 4).setValue(requestsSent);
  dashSh.getRange(rowIdx + 1, 5).setValue(responded);
  dashSh.getRange(rowIdx + 1, 7).setValue(emailResponses);
  dashSh.getRange(rowIdx + 1, 15).setValue(opened);
  dashSh.getRange(rowIdx + 1, 16).setValue(pctOpened);
  dashSh.getRange(rowIdx + 1, 8).setValue(pctResponse);
  dashSh.getRange(rowIdx + 1, 11).setValue(quickest);
  dashSh.getRange(rowIdx + 1, 12).setValue(average);
  if (lastResponse) dashSh.getRange(rowIdx + 1, 13).setValue(lastResponse);
  dashSh.getRange(rowIdx + 1, 14).setValue(average);
}

// ---------- REPLY & OPEN CHECKING ----------

function checkRepliesAndOpens() {
  const trackSh = getSheet_(TRACKING_SHEET);
  const data = trackSh.getDataRange().getValues();
  const myEmail = Session.getActiveUser().getEmail();
  const batchesTouched = {};

  for (let i = 1; i < data.length; i++) {
    const status = data[i][TC.STATUS - 1];
    const threadId = data[i][TC.THREAD_ID - 1];
    if (status === 'Responded' || !threadId) continue;

    let thread;
    try { thread = GmailApp.getThreadById(threadId); } catch (err) { continue; }
    if (!thread) continue;

    const messages = thread.getMessages();
    if (messages.length <= 1) continue;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.getFrom().indexOf(myEmail) !== -1) continue;

    const dateSent = data[i][TC.DATE_SENT - 1];
    const responseDate = lastMsg.getDate();
    const responseDays = dateSent ? Math.round((responseDate - new Date(dateSent)) / 86400000 * 10) / 10 : '';

    const rowNum = i + 1;
    const oldStatus = status;
    trackSh.getRange(rowNum, TC.STATUS).setValue('Responded');
    trackSh.getRange(rowNum, TC.DATE_UPDATED).setValue(responseDate);
    trackSh.getRange(rowNum, TC.RESPONSE_DAYS).setValue(responseDays);
    trackSh.getRange(rowNum, TC.RESPONSE_TIME).setValue(Utilities.formatDate(responseDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
    trackSh.getRange(rowNum, TC.EMAIL_RESPONSE).setValue(responseDate);

    appendAuditLog_(data[i][TC.KEY - 1], data[i][TC.CLUB - 1], TRACKING_SHEET, 'Email Status', oldStatus, 'Responded');
    batchesTouched[data[i][TC.BATCH_KEY - 1]] = true;
  }

  Object.keys(batchesTouched).forEach(refreshDashboardStats_);
}

function enableAutoCheckTrigger() {
  disableAutoCheckTrigger();
  ScriptApp.newTrigger('checkRepliesAndOpens').timeBased().everyMinutes(30).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Auto reply-check enabled (every 30 min).');
}

function disableAutoCheckTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkRepliesAndOpens') ScriptApp.deleteTrigger(t);
  });
}

// ---------- OPEN-TRACKING PIXEL (WEB APP) ----------

function doGet(e) {
  const key = e && e.parameter && e.parameter.key;
  if (key) { try { recordOpen_(key); } catch (err) { /* always return the pixel */ } }
  return Utilities.newBlob(
    Utilities.base64Decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'),
    'image/gif', 'pixel.gif'
  );
}

function recordOpen_(key) {
  const sh = getSheet_(TRACKING_SHEET);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][TC.KEY - 1] === key) {
      const rowNum = i + 1;
      const status = data[i][TC.STATUS - 1];
      const isFirstOpen = !data[i][TC.DATE_OPENED - 1];
      const currentCount = Number(data[i][TC.OPEN_COUNT - 1]) || 0;

      if (isFirstOpen) {
        sh.getRange(rowNum, TC.DATE_OPENED).setValue(new Date());
      }
      sh.getRange(rowNum, TC.OPEN_COUNT).setValue(currentCount + 1);

      // Only promote status Sent -> Opened; never downgrade a Responded row.
      if (status === 'Sent') {
        sh.getRange(rowNum, TC.STATUS).setValue('Opened');
        sh.getRange(rowNum, TC.DATE_UPDATED).setValue(new Date());
        appendAuditLog_(key, data[i][TC.CLUB - 1], TRACKING_SHEET, 'Email Status', 'Sent', 'Opened');
      }
      if (isFirstOpen) {
        refreshDashboardStats_(data[i][TC.BATCH_KEY - 1]);
      }
      break;
    }
  }
}