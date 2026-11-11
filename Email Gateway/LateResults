/**
 * LateResults.gs
 * Add to the SAME Apps Script project as SheetFunctions / Code.js / ScheduledEmails
 * (bound to the Email Tracking spreadsheet).
 *
 * Daily job: for every Event Data row whose Results = "Not Started" and whose event date
 * (or valid Rescheduled Date) is AFTER_DAYS or more days ago, email the class coordinator,
 * then repeat every EVERY_DAYS days until Results changes (e.g. to "Processed").
 *
 * Sends exactly like sendCampaign() in SheetFunctions: GmailApp + open pixel, a Tracking row
 * (so checkRepliesAndOpens / the pixel doGet keep Opened / Responded up to date), a Dashboard
 * row and an Audit_Log entry. One Batch Key per event: LATE-<HexKey>.
 *
 * Reuses from SheetFunctions: TC, TRACKING_SHEET, getSheet_, getProp_, appendAuditLog_,
 * upsertDashboardRow_, refreshDashboardStats_.
 */

const LR = {
  CLUB: '1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI',   // SMMC Club Management
  TPL:  '1M0_jDbN35e6eX96SNylY-J887Ks48Y9dNudOYMgKkjE',   // Email Templates
  CAL:  '1AVopdio8GLzwYGQjiX7qiVBXWQVpmArmaGBLWYTHxrM',   // SMMC Annual Calendar
  CAL_SHEET: 'Event Data',
  TEMPLATE: 'Late Submission',
  FROM_DATE: '2026-10-01',                 // ignore events before this date
  CC_ROLES: ['Race Coordinator', 'President'],   // looked up by role in Committee
  AFTER_DAYS: 2,
  EVERY_DAYS: 2,
  STOP_ON_REPLY: false,                    // true = also stop once the coordinator replies
  TRIGGER_HOUR: 8
};
const LR_SITE_BASE = 'https://norwest1998.github.io/Home';   // ← folder that holds resultsManagement.html

function lrLink_(hexKey) {
  const k = String(hexKey || '').trim();
  return LR_SITE_BASE + '/resultsManagement.html' + (k ? '?outstanding=' + encodeURIComponent(k) : '');
}

// → put it in the template as an <a href="${link}">View</a> next to each event

// ---------- ENTRY POINTS ----------

function checkLateResults()  { lrRun_(false); }
function lateResultsDryRun() { lrRun_(true); }   // logs what WOULD be sent, sends nothing

function installLateResultsTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkLateResults')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkLateResults').timeBased().everyDays(1).atHour(LR.TRIGGER_HOUR).create();
}

// ---------- MAIN ----------

function lrRun_(dry) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const tz = Session.getScriptTimeZone();
    const today = lrDay_(new Date());
    const from = lrDate_(LR.FROM_DATE);

    const club = SpreadsheetApp.openById(LR.CLUB);
    const classes = lrRows_(club, 'Classes', 'ClassID');
    const members = lrRows_(club, 'Members', 'MemberName');
    const committee = lrRows_(club, 'Committee', 'Role');
    const tpl = lrTemplate_();
    const roleCc = LR.CC_ROLES
      .map(role => { const c = committee.find(x => lrN_(x.Role) === lrN_(role)); return c ? String(c.Email || '').trim() : ''; })
      .filter(Boolean);

    const track = getSheet_(TRACKING_SHEET);
    const hist = {};   // batchKey -> [{rowNum, status, sent}]
    track.getDataRange().getValues().slice(1).forEach((r, i) => {
      const b = String(r[TC.BATCH_KEY - 1]);
      if (b.indexOf('LATE-') !== 0) return;
      const d = r[TC.DATE_SENT - 1] instanceof Date ? r[TC.DATE_SENT - 1] : new Date(r[TC.DATE_SENT - 1]);
      (hist[b] = hist[b] || []).push({ key: String(r[TC.KEY - 1]), status: r[TC.STATUS - 1], sent: d });
    });

    const sender = getProp_('SENDER_NAME') || 'SMMC Admin';
    const webAppUrl = getProp_('WEBAPP_URL');
    if (!webAppUrl) Logger.log('WARNING: WEBAPP_URL not set - emails will send without the open pixel.');

    let sent = 0;

    lrRows_(SpreadsheetApp.openById(LR.CAL), LR.CAL_SHEET, 'HexKey').forEach(ev => {
      if (String(ev['Results']).trim() !== 'Not Started') return;
      const orig = lrDate_(ev['Date']);
      if (!orig) return;
      const evDate = lrDate_(ev['Rescheduled Date']) || orig;   // "Pending ..." values are ignored
      if (from && evDate < from) return;
      const overdue = Math.round((today - evDate) / 864e5);
      if (overdue < LR.AFTER_DAYS) return;

      const cls = classes.find(c => lrN_(c.ClassName) === lrN_(ev['Class']));
      const coord = cls ? String(cls.Coordinator || '').trim() : '';
      if (!coord) return;                                        // e.g. Social has no coordinator

      const dateStr = Utilities.formatDate(evDate, tz, 'EEE d MMM yyyy');
      const evName = [ev['Class'], ev['Regatta Type'], ev['Round no'] ? 'Rd ' + ev['Round no'] : ''].filter(Boolean).join(' ');
      const eventId = String(ev['HexKey']).trim() || [Utilities.formatDate(orig, tz, 'yyyyMMdd'), ev['Class'], ev['Start']].join('-');
      const batchKey = 'LATE-' + eventId;
      const prior = (hist[batchKey] || []).filter(h => !isNaN(h.sent));

      if (LR.STOP_ON_REPLY && prior.some(h => h.status === 'Responded')) return;
      if (prior.length) {
        const last = Math.max.apply(null, prior.map(h => +lrDay_(h.sent)));
        if (Math.round((today - last) / 864e5) < LR.EVERY_DAYS) return;
      }

      const to = lrEmail_(coord, members, committee);
      if (!to) { Logger.log('SKIP %s: no email found for coordinator "%s"', evName, coord); return; }

      const n = prior.length + 1;
      const key = batchKey + '-R' + n + '-' + Utilities.getUuid().substring(0, 8);
      const link = lrLink_(ev['HexKey']);                        // NEW: deep link to this event's row
      const vars = { coordinator: coord, class: ev['Class'], event: evName, eventDate: dateStr,
                     daysOverdue: overdue, reminderNo: n,
                     link: link,                                                       // raw URL
                     eventLink: '<a href="' + link + '">' + evName + ' – ' + dateStr + '</a>' };   // ready-made anchor
      const subject = lrFill_((tpl.prefix + ' ' + tpl.subject).trim(), vars);
      const pixel = webAppUrl
        ? '<img src="' + webAppUrl + '?key=' + encodeURIComponent(key) + '&t=' + Date.now() + '" width="1" height="1" style="display:none" alt="">'
        : '';
      const html = lrFill_(tpl.body, vars) + tpl.sig;
      const cc = lrUnique_(roleCc.concat(tpl.cc.split(/[,;]/)).map(s => s.trim()).filter(Boolean))
                   .filter(e => lrN_(e) !== lrN_(to)).join(',');

      if (dry) { Logger.log('DRY RUN #%s -> %s (cc: %s) | %s | %s', n, to, cc, subject, link); return; }

      const x = deliver_({ batchKey, subject, cc, bcc: tpl.bcc.trim(), recipients: [{ email: to, name: coord, key, resolvedBody: html }] })[0];
      if (!x.ok) { Logger.log('SEND FAILED %s -> %s: %s', evName, to, x.error); return; }
      dataGw_('append', 'Tracking', { rowData: {
        'Batch Key': batchKey, 'Club': 'SMMC', 'Contact Name': coord, 'Contact Role': 'Class Coordinator', 'Email Status': 'Sent',
        'Key': key, 'Date Sent': new Date().toISOString(), 'Reminder Sent': 'No',
        'Comments': 'Late results reminder #' + n + ' - ' + evName + ' ' + dateStr,
        'Thread ID': x.threadId || '', 'Recipient Email': to, 'Open Count': 0 } });
      prior.forEach(h => dataGw_('update', 'Tracking', { hexKey: h.key, update: { 'Reminder Sent': 'Yes' } }));
      (hist[batchKey] = hist[batchKey] || []).push({ key, status: 'Sent', sent: new Date() });

      upsertDashboardRow_(batchKey, 'Late results: ' + evName + ' ' + dateStr, new Date());
      refreshDashboardStats_(batchKey);
      centralAudit_('send', 'tracking', 'Tracking', batchKey, 'Late results reminder #' + n + ' (' + evName + ')', '', 'Sent to ' + to, 'Success');
      sent++;
    });

    Logger.log('checkLateResults finished%s: %s sent', dry ? ' (dry run)' : '', sent);
  } finally {
    lock.releaseLock();
  }
}

// ---------- HELPERS ----------

const lrN_ = s => String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
const lrDay_ = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const lrUnique_ = a => a.filter((x, i) => a.findIndex(y => lrN_(y) === lrN_(x)) === i);
const lrFill_ = (s, v) => String(s).replace(/[#$]\{([\w-]+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));
const lrText_ = h => String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

/** Rows as objects, using the first row that contains `anchor` as the header (Committee has a title row above it). */
function lrRows_(ss, sheetName, anchor) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const v = sh.getDataRange().getValues();
  const h = v.findIndex(r => r.some(c => String(c).trim() === anchor));
  if (h < 0) throw new Error('Header "' + anchor + '" not found in ' + sheetName);
  const head = v[h].map(c => String(c).trim());
  return v.slice(h + 1)
    .filter(r => r.some(c => c !== ''))
    .map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

/** Accepts Date objects, "yyyy/MM/dd", "yyyy-MM-dd" and ISO timestamps. Anything else (e.g. "Pending ...") -> null. */
function lrDate_(v) {
  if (v instanceof Date) return isNaN(v) ? null : lrDay_(v);
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? null : lrDay_(d); }
  return null;
}

/** Coordinator email: Members sheet first, then the Committee sheet. */
function lrEmail_(name, members, committee) {
  const n = lrN_(name);
  const pick = (rows, nameCol, mailCols) => {
    const r = rows.find(x => lrN_(x[nameCol]) === n);
    if (!r) return '';
    const col = mailCols.find(c => String(r[c] || '').trim());
    return col ? String(r[col]).trim() : '';
  };
  return pick(members, 'MemberName', ['Email', 'Email Address', 'Member email'])
      || pick(committee, 'Member', ['Email']);
}

function lrTemplate_() {
  const ss = SpreadsheetApp.openById(LR.TPL);
  const t = lrRows_(ss, 'EmailTemplates', 'TemplateID').find(r => lrN_(r.Name) === lrN_(LR.TEMPLATE));
  if (!t) throw new Error('Template "' + LR.TEMPLATE + '" not found in EmailTemplates.');
  let sig = '';
  const sid = String(t.Signature || '').trim();
  if (sid) {
    const s = lrRows_(ss, 'Signatures', 'SignatureID').find(r => String(r.SignatureID).trim() === sid);
    sig = s ? '<br>' + String(s.Body) : '';
  }
  return {
    prefix: String(t.SubjectPrefix || '').trim(), subject: String(t.DefaultSubject || '').trim(),
    cc: String(t.DefaultCC || ''), bcc: String(t.DefaultBCC || ''),
    body: String(t.Body || ''), sig
  };
}
