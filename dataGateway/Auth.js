const GOOGLE_CLIENT_ID = "738246015685-4vk2o2l7nit598jvkl8r423sa4hff8rf.apps.googleusercontent.com";
const TOKEN_TTL_MS     = 60 * 60 * 1000;
const PUBLIC_ACTIONS = ["login", "requestCode", "verifyCode", "passwordLogin"];
const DENY_SHEETS      = ["apps|Tokens", "audit|Users"];
const VALID_ROLES = ["viewer", "coord", "editor", "admin"];
const VALID_LOGIN = ["google", "code", "password"];
const PERMS = { viewer:["read"], editor:["read","write"], admin:["read","write","delete","admin"] };
const ROLE_DOMAINS = {
      viewer: { members:"r", documents:"r", calendar:"r", notes:"r", results:"r", tracking:"r", apps:"r", requests:"rw", media:"r", racing:"r" },
      coord:  { members:"r", documents:"r", calendar:"r", notes:"r", results:"rw", tracking:"r", apps:"r", requests:"rw", media:"r", racing:"rw" },
      editor: { members:"rw", documents:"rw", calendar:"rw", notes:"rw", results:"rw", tracking:"rw", apps:"rw", requests:"rw", media:"rw",racing:"rw"},
      admin:  { members:"rwd", documents:"rwd", calendar:"rwd", notes:"rwd", results:"rwd", tracking:"rwd", apps:"rwd", requests:"rwd", audit:"rwd", media:"rwd", racing:"rwd" }
};
const ACTION_CODE = { fetch:"r", search:"r", batchFetch:"r", layout:"r", append:"w", update:"w", delete:"d", appendAvgScrReq:"w", genReport:"w" };
const ANY_ROLE    = [
      "getRegistry", "changePassword", "listFolder", "readFile", "registerSchema",
      "seriesOverview", "registerSeries", "withdrawSeries", "getMyProfile", "updateMyProfile", "addMyBoat",
      "previewFacebookImage", "listBackgroundImages", "processFacebookQueue"
];
const ADMIN_ONLY = [
      "refreshCache", "refreshSchema","resetPassword", "listUsers", "createUser", "updateUser", 
      "addUser", "getLoginLogs", "getUsageSummary", "getSessionPageViews"];
const ACTION_TYPE = {
      fetch:"read", batchFetch:"read", layout:"read", getRegistry:"read", registerSchema:"read",
      append:"write", appendAvgScrReq:"write", update:"write", delete:"delete", refreshCache:"admin",refreshSchema:"admin",
      listFolder:"read", readFile:"read", triggerResults:"write"
};
const MEMBER_PROTECTED = ["racing|SeriesEntries"];
var CURRENT_USER = "unknown", CURRENT_ROLE = "", CURRENT_SID = "";

function _sig(b) {
  const secret = PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(b, secret));
}
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// if these two change - change in fileGateway too
function signToken(p) {
  if (!p.sid) p.sid = "s_" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  const b = Utilities.base64EncodeWebSafe(JSON.stringify(p));
  return b + "." + _sig(b);
}

function verifyToken(t) {
  if (!t || String(t).indexOf(".") < 0) return null;
  const [b, s] = String(t).split("."), e = _sig(b);
  let d = s.length ^ e.length;
  for (let i = 0; i < e.length; i++) d |= (s.charCodeAt(i) || 0) ^ e.charCodeAt(i);
  if (d) return null;
  const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString());
  return p.exp > Date.now() ? p : null;
}

function getSessionPageViews_(sessionId, email) {
  try {
    const sh = getOrCreateAuditSheet_("PageViews", [
      "ViewID", "Timestamp", "Email", "Role", "Page", "UserAgent", "SessionID"
    ]);
    const v = sh.getDataRange().getValues();
    if (v.length <= 1) return [];
    const h = v[0].map(x => String(x).trim());
    const sIdx = h.indexOf("SessionID");
    const eIdx = h.indexOf("Email");
    
    const sid = String(sessionId || "").trim();
    const em = String(email || "").trim().toLowerCase();

    // Match on SessionID if present, or fallback to Email
    return v.slice(1).reverse().filter(r => {
      if (sid && String(r[sIdx]).trim() === sid) return true;
      if (!sid && em && String(r[eIdx]).trim().toLowerCase() === em) return true;
      return false;
    }).slice(0, 100).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
  } catch(e) {
    console.warn("getSessionPageViews error:", e);
    return [];
  }
}

function lookupUser(email) {
  const cache = CacheService.getScriptCache();
  let map = JSON.parse(cache.get("USERS_MAP") || "null");
  if (!map) {
    map = {};
    const v = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID).getSheetByName("Users").getDataRange().getValues();
    const h = v[0].map(x => String(x).trim());
    v.slice(1).forEach(r => {
      const o = Object.fromEntries(h.map((k, i) => [k, r[i]]));
      const em = String(o.Email).trim().toLowerCase();
      if (em && String(o.Active).toUpperCase() === "TRUE")
        map[em] = { name: o.Name, role: String(o.Role).trim().toLowerCase(),
            lt: String(o.LoginType || "google,code").toLowerCase() };
    });
    cache.put("USERS_MAP", JSON.stringify(map), 300);
  }
  return map[String(email).toLowerCase()] || null;
}

// Ensure Audit Sheets (LoginLog, PageViews) exist
function getOrCreateAuditSheet_(sheetName, headers) {
  const entry = getRegistryEntry("audit");
  const ss = SpreadsheetApp.openById(entry.spreadsheetId);
  let sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Login Logging Function
function logLoginAttempt_(opts) {
  try {
    const sh = getOrCreateAuditSheet_("LoginLog", [
      "LogID", "Timestamp", "Email", "Role", "Method", "Status", "Reason", "UserAgent", "SessionID"
    ]);
    const logId = "LOG-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
    const ts = new Date().toISOString();
    sh.appendRow([
      logId,
      ts,
      String(opts.email || "").toLowerCase(),
      opts.role || "",
      opts.method || "",
      opts.status || "",
      opts.reason || "",
      String(opts.userAgent || "").slice(0, 200),
      opts.sid || ""
    ]);
  } catch (err) {
    console.warn("Failed to record login attempt:", err);
  }
}

// Record successful login & update User row timestamps
function recordLoginSuccess_(email, role, method, sid, userAgent) {
  const nowIso = new Date().toISOString();
  logLoginAttempt_({
    email,
    role,
    method,
    status: "SUCCESS",
    reason: "Authenticated",
    sid,
    userAgent
  });

  try {
    const sh = usersSheet_();
    ensureUserPresenceHeaders_(sh);
    const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
    const ec = h.indexOf("Email");
    const iLogin = h.indexOf("LastLoginAt");
    const iActive = h.indexOf("LastActiveAt");
    const iPage = h.indexOf("LastPage");

    for (let i = 1; i < v.length; i++) {
      if (String(v[i][ec]).trim().toLowerCase() === email.toLowerCase()) {
        if (iLogin >= 0) sh.getRange(i + 1, iLogin + 1).setValue(nowIso);
        if (iActive >= 0) sh.getRange(i + 1, iActive + 1).setValue(nowIso);
        if (iPage >= 0) sh.getRange(i + 1, iPage + 1).setValue("login.html");
        break;
      }
    }
  } catch(e) {
    console.warn("Could not update User login timestamp:", e);
  }
}

function ensureUserPresenceHeaders_(sh) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  const needed = ["LastLoginAt", "LastActiveAt", "LastPage"];
  const toAdd = needed.filter(c => !h.includes(c));
  if (toAdd.length > 0) {
    sh.getRange(1, h.length + 1, 1, toAdd.length).setValues([toAdd]);
  }
}

function doLogin(idToken, clientMeta = {}) {
  const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
                              { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) {
    logLoginAttempt_({ email: "unknown", method: "google", status: "FAILURE", reason: "INVALID_GOOGLE_TOKEN", userAgent: clientMeta.userAgent });
    return null;
  }
  const g = JSON.parse(r.getContentText());
  if (g.aud !== GOOGLE_CLIENT_ID || String(g.email_verified) !== "true") {
    logLoginAttempt_({ email: g.email || "unknown", method: "google", status: "FAILURE", reason: "UNVERIFIED_EMAIL_OR_AUD", userAgent: clientMeta.userAgent });
    return null;
  }
  const u = lookupUser(g.email);
  if (!u) {
    logLoginAttempt_({ email: g.email, method: "google", status: "FAILURE", reason: "USER_NOT_REGISTERED", userAgent: clientMeta.userAgent });
    return null;
  }
  if (!u.lt.includes("google")) {
    logLoginAttempt_({ email: g.email, role: u.role, method: "google", status: "FAILURE", reason: "GOOGLE_LOGIN_NOT_ALLOWED", userAgent: clientMeta.userAgent });
    return null;
  }
  
  const exp = Date.now() + TOKEN_TTL_MS;
  const sid = "s_" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  recordLoginSuccess_(g.email.toLowerCase(), u.role, "google", sid, clientMeta.userAgent);

  return { token: signToken({ email: g.email.toLowerCase(), role: u.role, exp, sid }),
           email: g.email, name: u.name, role: u.role, exp, sid };
}

function completeRegister(tok, pwd) {
  pwd = String(pwd || "");
  if (pwd.length < 10) throw new Error("Password must be at least 10 characters.");   // token not consumed
  const rec = readSetup_(tok); if (!rec) return null;
  const row = getUserRow_(rec.email);
  if (!row || String(row.Active).toUpperCase() !== "TRUE") return null;
  const salt = Utilities.getUuid(), cache = CacheService.getScriptCache();
  const lt = [...new Set(String(row.LoginType || "").toLowerCase().split(",")
               .map(s => s.trim()).filter(Boolean).concat("password"))].join(",");
  setUserFields_(row, { Salt: salt, PwdHash: pwdHash_(pwd, salt), MustChange: false, LoginType: lt });
  cache.remove("setup_" + _hash(String(tok)));                 // single use
  cache.remove("pw_fail_" + rec.email);
  CURRENT_USER = rec.email;   // public action: set so the audit shows Name <email>
  auditLog("update", "audit", "Users", rec.email, "Password", "", "set via register link", "Success");
  const role = String(row.Role).trim().toLowerCase(), exp = Date.now() + TOKEN_TTL_MS;

  return { token: signToken({ email: rec.email, role, exp }), email: rec.email,
           name: row.Name, role, exp, next: rec.next };
}

function authorize(action, payload) {
  if (PUBLIC_ACTIONS.includes(action)) { CURRENT_USER = "public"; return null; }
  const p = verifyToken(payload.token);
  const u = p && lookupUser(p.email);
  if (!u) {
    return json({ code: "AUTH", error: "Unauthorized" });
  }
  if (p.mc && action !== "changePassword") return json({ code: "AUTH", error: "Password change required" });
  const known = action in ACTION_CODE || ANY_ROLE.includes(action) || ADMIN_ONLY.includes(action);
  if (!known || !ROLE_DOMAINS[u.role] || (ADMIN_ONLY.includes(action) && u.role !== "admin"))
    return json({ code: "FORBIDDEN", error: "Forbidden" });
  CURRENT_USER = p.email; CURRENT_ROLE = u.role; CURRENT_SID = p.sid || "";
  return null;
}

function checkAccess(domain, sheet, code) {
  sheet = sheet || getRegistryEntry(domain).defaultSheet;
  if (DENY_SHEETS.includes(domain + "|" + sheet)) throw new Error("Forbidden");
  if (MEMBER_PROTECTED.includes(domain + "|" + sheet) &&
    !(code === "r" ? ["coord","editor","admin"] : ["editor","admin"]).includes(CURRENT_ROLE)) throw new Error("Forbidden");
  if (!(ROLE_DOMAINS[CURRENT_ROLE]?.[domain] || "").includes(code)) throw new Error("Forbidden: " + domain);
}

function _hash(s) {
  const sec = PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + sec));
}

function requestLoginCode(email, clientMeta = {}) {
  email = String(email).trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const u = lookupUser(email);
  if (!u) {
    logLoginAttempt_({ email, method: "code", status: "FAILURE", reason: "UNKNOWN_EMAIL", userAgent: clientMeta.userAgent });
    return null;
  }
  if (!u.lt.includes("code")) {
    logLoginAttempt_({ email, role: u.role, method: "code", status: "FAILURE", reason: "CODE_LOGIN_DISABLED", userAgent: clientMeta.userAgent });
    return null;
  }
  if (cache.get("otp_rl_" + email)) {
    logLoginAttempt_({ email, role: u.role, method: "code", status: "FAILURE", reason: "RATE_LIMITED (1/min)", userAgent: clientMeta.userAgent });
    return null;
  }

  const code = String(parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 8), 16) % 900000 + 100000);
  cache.put("otp_" + email, JSON.stringify({ h: _hash(email + code), n: 0 }), 600);
  cache.put("otp_rl_" + email, "1", 60);
  MailApp.sendEmail(email, "Your SMMC login code", "Your code is " + code + ". It expires in 10 minutes.");
  
  logLoginAttempt_({ email, role: u.role, method: "code", status: "CODE_SENT", reason: "Emailed one-time code", userAgent: clientMeta.userAgent });
}

function verifyLoginCode(email, code, clientMeta = {}) {
  email = String(email).trim().toLowerCase();
  const cache = CacheService.getScriptCache(), k = "otp_" + email;
  const rec = JSON.parse(cache.get(k) || "null");
  if (!rec) {
    logLoginAttempt_({ email, method: "code", status: "FAILURE", reason: "CODE_EXPIRED_OR_NOT_REQUESTED", userAgent: clientMeta.userAgent });
    return null;
  }
  if (rec.n >= 5) {
    cache.remove(k);
    logLoginAttempt_({ email, method: "code", status: "FAILURE", reason: "MAX_OTP_ATTEMPTS_EXCEEDED", userAgent: clientMeta.userAgent });
    return null;
  }
  if (rec.h !== _hash(email + String(code).trim())) {
    rec.n++;
    cache.put(k, JSON.stringify(rec), 600);
    logLoginAttempt_({ email, method: "code", status: "FAILURE", reason: "INVALID_CODE (attempt " + rec.n + "/5)", userAgent: clientMeta.userAgent });
    return null;
  }
  cache.remove(k);
  const u = lookupUser(email);
  if (!u || !u.lt.includes("code")) {
    logLoginAttempt_({ email, method: "code", status: "FAILURE", reason: "CODE_NOT_AUTHORIZED", userAgent: clientMeta.userAgent });
    return null;
  }
  
  const exp = Date.now() + TOKEN_TTL_MS;
  const sid = "s_" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  recordLoginSuccess_(email, u.role, "code", sid, clientMeta.userAgent);

  return { token: signToken({ email, role: u.role, exp, sid }), email, name: u.name, role: u.role, exp, sid };
}

const PWD_ROUNDS = 1000;

function _eq(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) d |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return d === 0;
}
function pwdHash_(pwd, salt) {
  let h = salt + pwd + PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");
  for (let i = 0; i < PWD_ROUNDS; i++)
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  return h;
}

function usersSheet_() { return SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID).getSheetByName("Users"); }
function getUserRow_(id) {
  const v = usersSheet_().getDataRange().getValues(), h = v[0].map(x => String(x).trim()), ec = h.indexOf("Email");
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][ec]).trim().toLowerCase() === id) {
      const o = Object.fromEntries(h.map((k, j) => [k, v[i][j]]));
      o._row = i + 1; o._h = h; return o;
    }
  }
  return null;
}
function setUserFields_(row, f) {
  const sh = usersSheet_();
  Object.keys(f).forEach(k => sh.getRange(row._row, row._h.indexOf(k) + 1).setValue(f[k]));
  CacheService.getScriptCache().remove("USERS_MAP");
}

function passwordLogin(id, pwd, clientMeta = {}) {
  id = String(id).trim().toLowerCase(); pwd = String(pwd || "");
  const cache = CacheService.getScriptCache(), lk = "pw_fail_" + id, fails = Number(cache.get(lk) || 0);
  if (fails >= 5) {
    logLoginAttempt_({ email: id, method: "password", status: "LOCKED", reason: "TOO_MANY_FAILED_ATTEMPTS", userAgent: clientMeta.userAgent });
    throw new Error("Too many attempts. Try again in 15 minutes.");
  }
  const row = getUserRow_(id);
  const hash = pwdHash_(pwd, row ? String(row.Salt) : "x");
  const ok = row && String(row.Active).toUpperCase() === "TRUE"
          && String(row.LoginType).toLowerCase().includes("password") && row.PwdHash && _eq(row.PwdHash, hash);
  if (!ok) {
    cache.put(lk, String(fails + 1), 900);
    
    logLoginAttempt_({
      email: id,
      role: row ? row.Role : "",
      method: "password",
      status: "FAILURE",
      reason: "BAD_CREDENTIALS (attempt " + (fails + 1) + "/5)",
      userAgent: clientMeta.userAgent
    });
    return null;
  }
  cache.remove(lk);
  const role = String(row.Role).trim().toLowerCase(), mc = String(row.MustChange).toUpperCase() === "TRUE";
  const exp = Date.now() + TOKEN_TTL_MS;
  const sid = "s_" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  recordLoginSuccess_(id, role, "password", sid, clientMeta.userAgent);

  return { token: signToken({ email: id, role, exp, mc: mc ? 1 : 0, sid }), email: id, name: row.Name, role, exp, mustChange: mc, sid };
}

function changePassword(oldPwd, newPwd) {
  if (String(newPwd || "").length < 10) return "Password must be at least 10 characters.";
  const row = getUserRow_(CURRENT_USER);
  if (!row || !row.PwdHash || !_eq(row.PwdHash, pwdHash_(String(oldPwd || ""), String(row.Salt)))) return "Current password is incorrect.";
  const salt = Utilities.getUuid();
  setUserFields_(row, { Salt: salt, PwdHash: pwdHash_(String(newPwd), salt), MustChange: false });
  return null;
}

function resetPassword(email) {
  const row = getUserRow_(String(email).trim().toLowerCase());
  if (!row) throw new Error("Unknown user");
  const temp = Utilities.getUuid().replace(/-/g, "").slice(0, 10), salt = Utilities.getUuid();
  setUserFields_(row, { LoginType: "password", Salt: salt, PwdHash: pwdHash_(temp, salt), MustChange: true });
  MailApp.sendEmail(row.Email, "SMMC temporary password", "Your temporary password is: " + temp + "\nYou must change it when you first sign in.");
}

function requireAdmin_(payload) {
  const p = verifyToken(payload.token), u = p && lookupUser(p.email);
  if (!u || u.role !== "admin" || p.mc) return json({ code: "FORBIDDEN", error: "Forbidden" });
  CURRENT_USER = p.email; CURRENT_ROLE = u.role; CURRENT_SID = p.sid || ""; return null;
}
const defaultLoginType_ = email => /@gmail\.com$/i.test(String(email).trim()) ? "google,code" : "code";
function normLoginType_(lt) {
  const p = [...new Set(String(lt || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean))];
  if (!p.length || p.some(x => !VALID_LOGIN.includes(x))) throw new Error("Invalid login type");
  return p.join(",");
}
const safeText_ = s => /^[=+\-@]/.test(String(s)) ? "'" + s : String(s).trim();

function listUsers_() {
  const sh = usersSheet_();
  ensureUserPresenceHeaders_(sh);
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
  return v.slice(1).filter(r => String(r[h.indexOf("Email")]).trim()).map(r => {
    const o = Object.fromEntries(h.map((k, i) => [k, r[i]]));
    const toIso = val => val instanceof Date ? val.toISOString() : (val ? String(val) : "");
    return {
      Email: String(o.Email).trim(),
      Name: o.Name,
      Role: String(o.Role).trim().toLowerCase(),
      Active: String(o.Active).toUpperCase() === "TRUE",
      LoginType: String(o.LoginType || ""),
      HasPassword: !!o.PwdHash,
      MustChange: String(o.MustChange).toUpperCase() === "TRUE",
      LockedUntil: toIso(o.LockedUntil),
      LastLoginAt: toIso(o.LastLoginAt),
      LastActiveAt: toIso(o.LastActiveAt),
      LastPage: String(o.LastPage || "")
    };
  });
}

function addUser_(email, name, role, loginType) {
  email = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email");
  role = String(role || "viewer").trim().toLowerCase();
  if (!VALID_ROLES.includes(role)) throw new Error("Invalid role");
  if (getUserRow_(email)) throw new Error("User already exists");
  const lt = loginType ? normLoginType_(loginType) : defaultLoginType_(email);
  const sh = usersSheet_();
  ensureUserPresenceHeaders_(sh);
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  const rec = { Email: email, Role: role, Name: safeText_(name || ""), Active: true, LoginType: lt, MustChange: false };
  sh.appendRow(h.map(k => rec[k] ?? ""));
  CacheService.getScriptCache().remove("USERS_MAP");
  auditLog("append", "audit", "Users", email, "", "", { Email: email, Role: role, LoginType: lt }, "Success");
  return { email, role, loginType: lt };
}

function updateUser_(email, f) {
  email = String(email || "").trim().toLowerCase();
  const row = getUserRow_(email); if (!row) throw new Error("Unknown user");
  const self = email === CURRENT_USER, cache = CacheService.getScriptCache(), set = {};
  if (f.role) {
    const r = String(f.role).trim().toLowerCase();
    if (!VALID_ROLES.includes(r)) throw new Error("Invalid role");
    if (self && r !== String(row.Role).trim().toLowerCase()) throw new Error("You can't change your own role");
    set.Role = r;
  }
  if (f.loginType) set.LoginType = normLoginType_(f.loginType);
  if (f.newEmail) {
    const ne = String(f.newEmail).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ne)) throw new Error("Invalid email");
    if (self) throw new Error("You can't change your own email");
    if (ne !== email && getUserRow_(ne)) throw new Error("Email already in use");
    set.Email = ne;
  }
  if (f.clearLock === true || f.clearLock === "true") {
    set.LockedUntil = "";
    cache.remove("pw_fail_" + email); cache.remove("otp_rl_" + email);
  }
  let n = 0;
  Object.keys(set).forEach(k => {
    const before = row[k] instanceof Date ? row[k].toISOString() : String(row[k] ?? "");
    if (String(set[k]) !== before) { auditLog("update", "audit", "Users", email, k, before, set[k], "Success"); n++; }
  });
  setUserFields_(row, set);
  return { updated: n };
}

// ── LEVEL 2: THROTTLED PAGE-VIEW TRACKING ──
function trackPageView_(page, userAgent) {
  if (!CURRENT_USER || CURRENT_USER === "unknown" || CURRENT_USER === "public") return { throttled: true };
  const cleanPage = String(page || "unknown").trim().replace(/[^a-zA-Z0-9_\-\.]/g, "").slice(0, 60);

  // Throttled per user and per page for 15 minutes (900 seconds)
  const cache = CacheService.getScriptCache();
  const cKey = "pv_" + CURRENT_USER.replace(/[^a-zA-Z0-9]/g, "") + "_" + cleanPage;
  if (cache.get(cKey)) return { throttled: true };
  cache.put(cKey, "1", 900);

  const nowIso = new Date().toISOString();

  // 1. Record PageView event
  try {
    const sh = getOrCreateAuditSheet_("PageViews", [
      "ViewID", "Timestamp", "Email", "Role", "Page", "UserAgent", "SessionID"
    ]);
    const viewId = "PV-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
    sh.appendRow([
      viewId,
      nowIso,
      CURRENT_USER,
      CURRENT_ROLE,
      cleanPage,
      String(userAgent || "").slice(0, 200),
      CURRENT_SID
    ]);
  } catch(e) {
    console.warn("Could not log PageView:", e);
  }

  // 2. Update User presence (throttled)
  try {
    const uKey = "pres_" + CURRENT_USER.replace(/[^a-zA-Z0-9]/g, "");
    if (!cache.get(uKey)) {
      cache.put(uKey, "1", 900);
      const sh = usersSheet_();
      ensureUserPresenceHeaders_(sh);
      const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
      const ec = h.indexOf("Email"), iActive = h.indexOf("LastActiveAt"), iPage = h.indexOf("LastPage");
      for (let i = 1; i < v.length; i++) {
        if (String(v[i][ec]).trim().toLowerCase() === CURRENT_USER.toLowerCase()) {
          if (iActive >= 0) sh.getRange(i + 1, iActive + 1).setValue(nowIso);
          if (iPage >= 0) sh.getRange(i + 1, iPage + 1).setValue(cleanPage);
          break;
        }
      }
    }
  } catch(e) {
    console.warn("Could not update User presence:", e);
  }

  return { recorded: true };
}

// ── AUDIT TELEMETRY FOR CONSOLE ──
function getLoginLogs_(limit = 150) {
  try {
    const sh = getOrCreateAuditSheet_("LoginLog", [
      "LogID", "Timestamp", "Email", "Role", "Method", "Status", "Reason", "UserAgent", "SessionID"
    ]);
    const v = sh.getDataRange().getValues();
    if (v.length <= 1) return [];
    const h = v[0].map(x => String(x).trim());
    return v.slice(1).reverse().slice(0, limit).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
  } catch(e) {
    return [];
  }
}

function getUsageSummary_() {
  try {
    const shPv = getOrCreateAuditSheet_("PageViews", ["ViewID", "Timestamp", "Email", "Role", "Page", "UserAgent", "SessionID"]);
    const vPv = shPv.getDataRange().getValues();
    const pageCounts = {};
    if (vPv.length > 1) {
      const h = vPv[0].map(x => String(x).trim()), pIdx = h.indexOf("Page");
      vPv.slice(1).forEach(r => {
        const pg = String(r[pIdx] || "").trim() || "unknown";
        pageCounts[pg] = (pageCounts[pg] || 0) + 1;
      });
    }

    const shLl = getOrCreateAuditSheet_("LoginLog", ["LogID", "Timestamp", "Email", "Role", "Method", "Status", "Reason", "UserAgent", "SessionID"]);
    const vLl = shLl.getDataRange().getValues();
    const methodCounts = { google: 0, code: 0, password: 0 };
    let totalLogins = 0, failedLogins = 0;
    if (vLl.length > 1) {
      const h = vLl[0].map(x => String(x).trim());
      const mIdx = h.indexOf("Method"), sIdx = h.indexOf("Status");
      vLl.slice(1).forEach(r => {
        const m = String(r[mIdx] || "").toLowerCase().trim();
        const s = String(r[sIdx] || "").toUpperCase().trim();
        if (methodCounts[m] !== undefined) methodCounts[m]++;
        if (s === "SUCCESS") totalLogins++;
        else failedLogins++;
      });
    }

    return { pageCounts, methodCounts, totalLogins, failedLogins };
  } catch(e) {
    return { pageCounts: {}, methodCounts: {}, totalLogins: 0, failedLogins: 0 };
  }
} 