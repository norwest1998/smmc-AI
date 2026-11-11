/**
 * ScheduledEmail.gs
 * Add this file to the same Apps Script project as Code.js (Email Management).
 * Bound to the Email Tracking spreadsheet (1T9Hojn4zW7C-2UXg8O8OYKcq_BRYqCHsgU2n3S1IW8o)
 *
 * SHEETS USED (auto-created if missing):
 *   Drafts  — rows written by the frontend when composing a scheduled email
 *   Sent    — rows written here after successful send
 *   Tracking — existing sheet, rows updated to "Sent" after scheduled send fires
 *
 * DRAFT SHEET HEADERS (must match frontend appendSheet payload):
 *   Draft ID | Key | Subject | To | CC | BCC | Body | Template ID |
 *   Signature ID | Scheduled | Saved At | Status
 *
 * SENT SHEET HEADERS:
 *   Sent ID | Key | Subject | To | CC | Scheduled | Sent At | Body |
 *   Template ID | Recipient Count
 */

// ── Sheet name constants ────────────────────────────────────────
const DRAFT_SHEET  = "Drafts";
const SENT_SHEET   = "Sent";

const DRAFT_HEADERS = [
  "Draft ID","Key","Subject","To","CC","BCC","Body",
  "Template ID","Signature ID","Scheduled","Saved At","Status"
];
const SENT_HEADERS = [
  "Sent ID","Key","Subject","To","CC","Scheduled",
  "Sent At","Body","Template ID","Recipient Count"
];

// ── Sheet helpers ───────────────────────────────────────────────
function getDraftSheet() {
  return getOrCreateSheet_(DRAFT_SHEET, DRAFT_HEADERS);
}
function getSentSheet() {
  return getOrCreateSheet_(SENT_SHEET, SENT_HEADERS);
}
function getOrCreateSheet_(name, headers) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToObjects_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .map((row, i) => {
      const obj = { _rowIndex: i + 2 };
      headers.forEach((h, c) => { obj[h] = row[c] ?? ""; });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== "" && v !== null));
}





// ── 1. createScheduledTrigger_ ──────────────────────────────────
/**
 * Called by the frontend when the user clicks Send on a scheduled email.
 * Stores the full email payload in the Drafts sheet and creates a
 * time-based Apps Script trigger set to fire at scheduledAt.
 *
 * Payload shape (from frontend):
 * {
 *   action:       "createScheduledTrigger",
 *   draftId:      "T1ABC…",          // uid from frontend
 *   scheduledAt:  "2026-10-01T09:00" // datetime-local value
 *   subject:      "Important: AGM Notice",
 *   to:           "a@x.com, b@x.com",
 *   cc:           "",
 *   bcc:          "",
 *   body:         "<p>…</p>",        // resolved HTML per recipient
 *   key:          "AGM-2026",
 *   templateId:   "TABC…",
 *   recipients:   [{ name:"Jane", email:"jane@x.com", resolvedBody:"<p>Hi Jane…</p>" }]
 * }
 */
function createScheduledTrigger_(payload) {
  const { draftId, scheduledAt, subject, to, cc, bcc, body, key, templateId, recipients } = payload;

  if (!draftId || !scheduledAt) {
    return { success: false, error: "draftId and scheduledAt are required." };
  }

  const fireAt = new Date(scheduledAt);
  if (isNaN(fireAt.getTime()) || fireAt <= new Date()) {
    return { success: false, error: "scheduledAt must be a valid future date/time." };
  }

  const trigger = ScriptApp.newTrigger("runScheduledEmails").timeBased().at(fireAt).create();
  try {
    dataGw_("append", "Drafts", { rowData: {
      "Draft ID": draftId, "Key": key || "", "Subject": subject || "", "To": to || "", "CC": cc || "", "BCC": bcc || "",
      "Body": JSON.stringify({ html: body, recipients: recipients || [] }), "Template ID": templateId || "",
      "Signature ID": "", "Scheduled": fireAt.toISOString(), "Saved At": new Date().toISOString(), "Status": "Scheduled" } });
  } catch (e) { ScriptApp.deleteTrigger(trigger); throw e; }
  PropertiesService.getScriptProperties().setProperty("trigger_" + trigger.getUniqueId(), draftId);

  return {
    success:    true,
    draftId:    draftId,
    triggerId:  trigger.getUniqueId(),
    scheduledAt: fireAt.toISOString()
  };
}

// ── 2. runScheduledEmails ───────────────────────────────────────
/**
 * Called by the time-based trigger.
 * Finds the draft for this trigger, sends each recipient's personalised
 * email, records in Sent + Tracking sheets, removes the draft row,
 * and deletes the trigger.
 */
function runScheduledEmails(e) {
  // Identify which draft this trigger is for
  const triggerId = e && e.triggerUid ? e.triggerUid : null;
  const props     = PropertiesService.getScriptProperties();
  const draftId   = triggerId ? props.getProperty("trigger_" + triggerId) : null;

  const draftSheet = getDraftSheet();
  const allDrafts  = sheetToObjects_(draftSheet);

  // Find the target draft — by draftId if we have it, else any Scheduled rows due now
  const now      = new Date();
  const targets  = draftId
    ? allDrafts.filter(r => r["Draft ID"] === draftId && r["Status"] === "Scheduled")
    : allDrafts.filter(r => {
        if (r["Status"] !== "Scheduled") return false;
        const due = new Date(r["Scheduled"]);
        return !isNaN(due.getTime()) && due <= now;
      });

  if (!targets.length) {
    Logger.log("runScheduledEmails: no matching scheduled drafts found. triggerId=%s draftId=%s", triggerId, draftId);
    cleanupTrigger_(triggerId, props);
    return;
  }

  targets.forEach(draft => {
    try {
      sendDraft_(draft);
    } catch (err) {
      Logger.log("runScheduledEmails: error sending draft %s — %s", draft["Draft ID"], err.message);
      // Mark draft as Failed so it's visible in the sheet
      try { 
        dataGw_("update", "Drafts", { hexKey: draft["Draft ID"], update: { Status: "Failed: " + err.message }}); 
      } catch (e) {}
    }
  });

  cleanupTrigger_(triggerId, props);
}

// ── 3. sendDraft_ ───────────────────────────────────────────────
function sendDraft_(draft) {
  const draftId = draft["Draft ID"], subject = draft["Subject"];
  let parsed; try { parsed = JSON.parse(draft["Body"]); } catch (_) { parsed = { html: draft["Body"], recipients: [] }; }
  const recipients = (parsed.recipients && parsed.recipients.length) ? parsed.recipients
    : String(draft["To"] || "").split(",").map(e => ({ email: e.trim(), name: e.trim(), resolvedBody: parsed.html || "" })).filter(r => r.email);
  const results = deliver_({ batchKey: draftId, subject, cc: draft["CC"], bcc: draft["BCC"], recipients });
  const iso = new Date().toISOString();
  results.forEach(x => {
    try { dataGw_("update", "Tracking", { hexKey: x.key, update: { "Email Status": x.ok ? "Sent" : "Failed", "Date Sent": iso, "Thread ID": x.threadId || "", "Comments": x.ok ? "" : x.error } }); }
    catch (e) { Logger.log("Tracking update failed for %s: %s", x.key, e.message); }
  });
  if (!results.some(x => x.ok)) throw new Error("No emails were sent.");
  dataGw_("append", "Sent", { rowData: { "Sent ID": draftId, "Key": draft["Key"], "Subject": subject, "To": draft["To"], "CC": draft["CC"],
    "Scheduled": draft["Scheduled"], "Sent At": iso, "Body": parsed.html || "", "Template ID": draft["Template ID"] || "", "Recipient Count": results.length } });
  dataGw_("delete", "Drafts", { hexKey: draftId });
  upsertDashboardRow_(draftId, subject, new Date()); refreshDashboardStats_(draftId);
}

// ── 4. cancelScheduledTrigger_ ─────────────────────────────────
/**
 * Cancels the trigger for a given draftId and removes the draft row.
 * Called by the frontend if the user deletes a scheduled draft.
 */
function cancelScheduledTrigger_(draftId) {
  if (!draftId) return { success: false, error: "draftId required." };

  const props    = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();

  // Find and delete the trigger whose property maps to this draftId
  let triggerDeleted = false;
  Object.entries(allProps).forEach(([propKey, val]) => {
    if (propKey.startsWith("trigger_") && val === draftId) {
      const triggerId = propKey.replace("trigger_", "");
      ScriptApp.getProjectTriggers().forEach(t => {
        if (t.getUniqueId() === triggerId) {
          ScriptApp.deleteTrigger(t);
          triggerDeleted = true;
        }
      });
      props.deleteProperty(propKey);
    }
  });

  // Remove draft row
  const row = sheetToObjects_(getDraftSheet()).find(r => r["Draft ID"] === draftId);
  if (row) {
    try { JSON.parse(row["Body"]).recipients.forEach(r => { if (r.key) dataGw_("update", "Tracking", { hexKey: r.key, update: { "Email Status": "Cancelled" } }); }); } catch (e) {}
    dataGw_("delete", "Drafts", { hexKey: draftId });
  }

  return { success: true, triggerDeleted };
}

// ── 5. cleanupTrigger_ ─────────────────────────────────────────
function cleanupTrigger_(triggerId, props) {
  if (!triggerId) return;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getUniqueId() === triggerId) ScriptApp.deleteTrigger(t);
  });
  if (props) props.deleteProperty("trigger_" + triggerId);
}

function sendNow_(p) {
  const { subject, to, cc, bcc, body, key, recipients } = p;
  if (!subject || (!to && !(recipients || []).length)) return { success: false, error: "subject and recipient required." };

  const list = (recipients && recipients.length)
    ? recipients
    : String(to).split(",").map(e => ({ email: e.trim(), resolvedBody: body }));
  const batchKey = key || generateTrackingKey();

  list.forEach(r => {
    if (!r.email) return;
    const opts = { htmlBody: r.resolvedBody || body || "" };
    if (cc)  opts.cc  = cc;
    if (bcc) opts.bcc = bcc;
    GmailApp.sendEmail(r.email, subject, "", opts);
    recordEmailSend({ batchKey: batchKey + "-" + r.email, key: batchKey, contactName: r.name || r.email,
                      contactRole: "", club: "", recipientEmail: r.email });
    centralAudit_('send', 'tracking', 'Tracking', batchKey, subject, '', 'Sent to ' + to, 'Success');
  });
  return { success: true, sent: list.length };
}