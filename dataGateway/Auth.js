const GOOGLE_CLIENT_ID = "738246015685-4vk2o2l7nit598jvkl8r423sa4hff8rf.apps.googleusercontent.com";
const PUBLIC_ACTIONS = ["login", "requestCode", "verifyCode", "passwordLogin"];
const DENY_SHEETS      = ["apps|Tokens", "audit|Users"];
const PERMS = { viewer:["read"], editor:["read","write"], admin:["read","write","delete","admin"] };
const DEFAULT_ROLE_DOMAINS = {   // seed only; live values come from the Roles/RolePerms sheets
  viewer: { members:"r", documents:"r", calendar:"r", notes:"r", results:"r", tracking:"r", apps:"r", requests:"rw", media:"r", racing:"r" },
  coord: { members:"r", documents:"r", calendar:"r", notes:"r", results:"rw", tracking:"r", apps:"r", requests:"rw", media:"r", racing:"rw" },
  editor: { members:"rw", documents:"rw", calendar:"rw", notes:"rw", results:"rw", tracking:"rw", apps:"rw", requests:"rw", media:"rw", racing:"rw"},
  admin:  { members:"rwd", documents:"rwd", calendar:"rwd", notes:"rwd", results:"rwd", tracking:"rwd",
            apps:"rwd", requests:"rwd", audit:"rwd", media:"rwd", racing:"rwd" }
};
const ACTION_CODE = { fetch:"r", search:"r", batchFetch:"r", layout:"r", append:"w", update:"w", delete:"d", appendAvgScrReq:"w", genReport:"w" };
const ANY_ROLE    = ["getRegistry", "changePassword", "listFolder", "readFile", "registerSchema","seriesOverview", "registerSeries", "withdrawSeries","getMyProfile","updateMyProfile","addMyBoat","getRoles"];
const ADMIN_ONLY = ["refreshCache", "resetPassword", "listUsers", "createUser", "updateUser", "addUser",
  "getAccessConfig", "previewAccessConfig", "saveAccessConfig", "listAccessHistory", "getAccessVersion"];
const ACTION_TYPE = {
  fetch:"read", batchFetch:"read", layout:"read", getRegistry:"read", registerSchema:"read",
  append:"write", appendAvgScrReq:"write", update:"write", delete:"delete", refreshCache:"admin",
  listFolder:"read", readFile:"read", triggerResults:"write"
};
var CURRENT_USER = "unknown", CURRENT_ROLE = "";

function _sig(b) {
  const secret = PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(b, secret));
}

function signToken(p) { const b = Utilities.base64EncodeWebSafe(JSON.stringify(p)); return b + "." + _sig(b); }

function verifyToken(t) {
  if (!t || String(t).indexOf(".") < 0) return null;
  const [b, s] = String(t).split("."), e = _sig(b);
  let d = s.length ^ e.length;
  for (let i = 0; i < e.length; i++) d |= (s.charCodeAt(i) || 0) ^ e.charCodeAt(i);
  if (d) return null;
  const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString());
  return p.exp > Date.now() ? p : null;
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

function doLogin(idToken) {
  const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
                              { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const g = JSON.parse(r.getContentText());
  if (g.aud !== GOOGLE_CLIENT_ID || String(g.email_verified) !== "true") return null;
  const u = lookupUser(g.email);
  if (!u || !u.lt.includes("google")) return null;
  if (!u) return null;
  const exp = Date.now() + ttlMs_();
  return { token: signToken({ email: g.email.toLowerCase(), role: u.role, exp }),
           email: g.email, name: u.name, role: u.role, exp };
}

// returns null if allowed, else an error response
function authorize(action, payload) {
  if (PUBLIC_ACTIONS.includes(action)) { CURRENT_USER = "public"; return null; }
  const p = verifyToken(payload.token);
  const u = p && lookupUser(p.email);
  if (!u) {
    return json({ code: "AUTH", error: "Unauthorized" });
  }
  if (p.mc && action !== "changePassword") return json({ code: "AUTH", error: "Password change required" });
  const known = action in ACTION_CODE || ANY_ROLE.includes(action) || ADMIN_ONLY.includes(action);
  if (!known || !roleActive_(u.role) || (ADMIN_ONLY.includes(action) && u.role !== "admin"))
    return json({ code: "FORBIDDEN", error: "Forbidden" });
  CURRENT_USER = p.email; CURRENT_ROLE = u.role;
  return null;
}

function checkAccess(domain, sheet, code) {
  sheet = sheet || getRegistryEntry(domain).defaultSheet;
  const key = domain + "|" + sheet, rule = accessConfig_().rules.find(x => x.key === key);
  if (DENY_SHEETS.includes(key)) throw new Error("Forbidden");
  if (rule && CURRENT_ROLE !== "admin") {
    const need = m => !m ? 0 : ((roleInfo_(m) || {}).rank || 1e9), mine = (roleInfo_(CURRENT_ROLE) || {}).rank || 0;
    if (rule.deny || mine < need(code === "r" ? rule.readMin : rule.writeMin)) throw new Error("Forbidden");
  }
  if (!roleCodes_(CURRENT_ROLE, domain).includes(code)) throw new Error("Forbidden: " + domain);
}

function _hash(s) {
  const sec = PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + sec));
}

function requestLoginCode(email) {
  email = String(email).trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const u = lookupUser(email);
  if (!u || !u.lt.includes("code")) return null;
  if (!u) return null;
  if (lookupUser(email) && !cache.get("otp_rl_" + email)) {        // 1 request per minute per email
    const code = String(parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 8), 16) % 900000 + 100000);
    cache.put("otp_" + email, JSON.stringify({ h: _hash(email + code), n: 0 }), 600);
    cache.put("otp_rl_" + email, "1", 60);
    MailApp.sendEmail(email, "Your SMMC login code", "Your code is " + code + ". It expires in 10 minutes.");
  }
  // caller always replies "success", so unknown emails can't be detected
}

function verifyLoginCode(email, code) {
  email = String(email).trim().toLowerCase();
  const cache = CacheService.getScriptCache(), k = "otp_" + email;
  const rec = JSON.parse(cache.get(k) || "null");
  if (!rec) return null;
  if (rec.n >= 5) { cache.remove(k); return null; }                // max 5 attempts
  if (rec.h !== _hash(email + String(code).trim())) { rec.n++; cache.put(k, JSON.stringify(rec), 600); return null; }
  cache.remove(k);
  const u = lookupUser(email);
  if (!u || !u.lt.includes("code")) return null;
  if (!u) return null;
  const exp = Date.now() + ttlMs_();
  return { token: signToken({ email, role: u.role, exp }), email, name: u.name, role: u.role, exp };
}

const PWD_ROUNDS = 1000;   // time it; raise only while login stays under ~2s

function _eq(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) d |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return d === 0;
}
function pwdHash_(pwd, salt) {
  let h = salt + pwd + PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");   // secret acts as pepper
  for (let i = 0; i < PWD_ROUNDS; i++)
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  return h;
}

function usersSheet_() { return SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID).getSheetByName("Users"); }
function getUserRow_(id) {                       // reads the sheet directly; hashes are never cached
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

function passwordLogin(id, pwd) {
  id = String(id).trim().toLowerCase(); pwd = String(pwd || "");
  const cache = CacheService.getScriptCache(), lk = "pw_fail_" + id, fails = Number(cache.get(lk) || 0);
  if (fails >= 5) throw new Error("Too many attempts. Try again in 15 minutes.");
  const row = getUserRow_(id);
  const hash = pwdHash_(pwd, row ? String(row.Salt) : "x");        // always hash, so timing doesn't reveal unknown users
  const ok = row && String(row.Active).toUpperCase() === "TRUE"
          && String(row.LoginType).toLowerCase().includes("password") && row.PwdHash && _eq(row.PwdHash, hash);
  if (!ok) { cache.put(lk, String(fails + 1), 900); return null; }
  cache.remove(lk);
  const role = String(row.Role).trim().toLowerCase(), mc = String(row.MustChange).toUpperCase() === "TRUE";
  const exp = Date.now() + ttlMs_();
  return { token: signToken({ email: id, role, exp, mc: mc ? 1 : 0 }), email: id, name: row.Name, role, exp, mustChange: mc };
}

function changePassword(oldPwd, newPwd) {         // caller is CURRENT_USER (verified token)
  if (String(newPwd || "").length < 10) return "Password must be at least 10 characters.";
  const row = getUserRow_(CURRENT_USER);
  if (!row || !row.PwdHash || !_eq(row.PwdHash, pwdHash_(String(oldPwd || ""), String(row.Salt)))) return "Current password is incorrect.";
  const salt = Utilities.getUuid();
  setUserFields_(row, { Salt: salt, PwdHash: pwdHash_(String(newPwd), salt), MustChange: false });
  return null;
}

function resetPassword(email) {                   // admin action, or run from the editor
  const row = getUserRow_(String(email).trim().toLowerCase());
  if (!row) throw new Error("Unknown user");
  const temp = Utilities.getUuid().replace(/-/g, "").slice(0, 10), salt = Utilities.getUuid();
  setUserFields_(row, { LoginType: "password", Salt: salt, PwdHash: pwdHash_(temp, salt), MustChange: true });
  MailApp.sendEmail(row.Email, "SMMC temporary password", "Your temporary password is: " + temp + "\nYou must change it when you first sign in.");
}
function resetFromEditor() { resetPassword("someone@example.com"); }   // bootstrap your first password user

function requireAdmin_(payload) {
  const p = verifyToken(payload.token), u = p && lookupUser(p.email);
  if (!u || u.role !== "admin" || p.mc) return json({ code: "FORBIDDEN", error: "Forbidden" });
  CURRENT_USER = p.email; CURRENT_ROLE = u.role; return null;
}
function defaultLoginType_(email) {
  const m = accessConfig_().settings.defaultLogin, d = String(email).trim().toLowerCase().split("@")[1] || "";
  return (m.find(x => x.domain === d) || m.find(x => x.domain === "*")).types.join(",");
}
function normLoginType_(lt) {
  const p = [...new Set(String(lt || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean))];
  if (!p.length || p.some(x => !validLogin_().includes(x))) throw new Error("Invalid login type");
  return p.join(",");
}
const safeText_ = s => /^[=+\-@]/.test(String(s)) ? "'" + s : String(s).trim();

function listUsers_() {                       // never returns Salt / PwdHash
  const v = usersSheet_().getDataRange().getValues(), h = v[0].map(x => String(x).trim());
  return v.slice(1).filter(r => String(r[h.indexOf("Email")]).trim()).map(r => {
    const o = Object.fromEntries(h.map((k, i) => [k, r[i]]));
    return { Email: String(o.Email).trim(), Name: o.Name, Role: String(o.Role).trim().toLowerCase(),
      Active: String(o.Active).toUpperCase() === "TRUE", LoginType: String(o.LoginType || ""),
      HasPassword: !!o.PwdHash, MustChange: String(o.MustChange).toUpperCase() === "TRUE",
      LockedUntil: o.LockedUntil instanceof Date ? o.LockedUntil.toISOString() : String(o.LockedUntil || "") };
  });
}

// Defaults: role viewer; LoginType 'google,code' for @gmail.com else 'code'.
function addUser_(email, name, role, loginType) {
  email = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid email");
  role = String(role || "viewer").trim().toLowerCase();
  if (!validRoles_().includes(role)) throw new Error("Invalid role");
  if (getUserRow_(email)) throw new Error("User already exists");
  const lt = loginType ? normLoginType_(loginType) : defaultLoginType_(email);
  const sh = usersSheet_(), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
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
    if (!validRoles_().includes(r)) throw new Error("Invalid role");
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
    cache.remove("pw_fail_" + email); cache.remove("otp_rl_" + email);   // also releases the password-attempt lockout
  }
  let n = 0;
  Object.keys(set).forEach(k => {
    const before = row[k] instanceof Date ? row[k].toISOString() : String(row[k] ?? "");
    if (String(set[k]) !== before) { auditLog("update", "audit", "Users", email, k, before, set[k], "Success"); n++; }
  });
  setUserFields_(row, set);                   // also clears USERS_MAP cache
  return { updated: n };
}

// ===== Dynamic access config =====
// Stored in CONFIG_SPREADSHEET_ID sheets: Roles, RolePerms, SheetRules, Settings, AccessHistory.
// Built-in DEFAULT_* values are used only until the sheets are first saved. A read error denies (fails closed).
const LOGIN_UNIVERSE = ["google", "code", "password"];
const DEFAULT_RANK  = { viewer: 1, coord: 2, editor: 3, admin: 4 };
const DEFAULT_LABEL = { viewer: "Viewer", coord: "Coordinator", editor: "Editor", admin: "Admin" };
const DEFAULT_RULES = [{ key: "racing|SeriesEntries", deny: false, readMin: "coord", writeMin: "editor" }];   // was MEMBER_PROTECTED
const DEFAULT_SETTINGS = { tokenTtlMin: 60, loginTypes: LOGIN_UNIVERSE.slice(),
  defaultLogin: [{ domain: "gmail.com", types: ["google", "code"] }, { domain: "*", types: ["code"] }] };
var _ACFG = null;

const roleInfo_   = r => accessConfig_().roles.find(x => x.role === r);
const roleActive_ = r => !!(roleInfo_(r) || {}).active;
const validRoles_ = () => accessConfig_().roles.filter(r => r.active).map(r => r.role);
const validLogin_ = () => accessConfig_().settings.loginTypes;
const ttlMs_      = () => accessConfig_().settings.tokenTtlMin * 60000;
const clean_      = c => ({ roles: c.roles, perms: c.perms, rules: c.rules, settings: c.settings });

function roleCodes_(role, domain) {             // admin always has full access to every domain
  const r = roleInfo_(role); if (!r || !r.active) return "";
  return role === "admin" ? "rwd" : ((accessConfig_().perms[role] || {})[domain] || "");
}

function normAccess_(c) {                        // structural clean-up only
  const roles = (c.roles || []).map(r => ({ role: String(r.role).trim().toLowerCase(),
      label: String(r.label || r.role).trim().replace(/^[=+\-@]+/, ""), rank: Number(r.rank) || 99,
      active: r.active === true || String(r.active).toUpperCase() === "TRUE" }))
    .filter((r, i, a) => r.role && a.findIndex(x => x.role === r.role) === i);
  if (!roles.some(r => r.role === "admin")) roles.push({ role: "admin", label: "Admin", rank: 99, active: true });
  roles.sort((a, b) => (a.role === "admin") - (b.role === "admin") || a.rank - b.rank)
       .forEach((r, i) => { r.rank = i + 1; if (r.role === "admin") r.active = true; });
  const perms = {};
  roles.forEach(r => {
    perms[r.role] = {};
    if (r.role === "admin") return;
    Object.entries((c.perms || {})[r.role] || {}).forEach(([d, s]) => {
      let v = ["r", "w", "d"].filter(x => String(s).includes(x)).join("");
      if (v && v[0] !== "r") v = "r" + v;
      if (v) perms[r.role][String(d).trim().toLowerCase()] = v;
    });
  });
  const rules = (c.rules || []).map(x => ({ key: String(x.key).trim(), deny: x.deny === true || String(x.deny).toUpperCase() === "TRUE",
      readMin: String(x.readMin || "").trim().toLowerCase(), writeMin: String(x.writeMin || "").trim().toLowerCase() }))
    .filter((x, i, a) => x.key.includes("|") && a.findIndex(y => y.key === x.key) === i);
  const s = c.settings || {}, d = DEFAULT_SETTINGS;
  const lt = a => [...new Set((Array.isArray(a) ? a : String(a || "").split(",")).map(x => String(x).trim().toLowerCase()).filter(x => LOGIN_UNIVERSE.includes(x)))];
  const settings = {
    tokenTtlMin: Math.min(1440, Math.max(5, parseInt(s.tokenTtlMin) || d.tokenTtlMin)),
    loginTypes: lt(s.loginTypes).length ? lt(s.loginTypes) : d.loginTypes.slice(),
    defaultLogin: (Array.isArray(s.defaultLogin) && s.defaultLogin.length ? s.defaultLogin : d.defaultLogin)
      .map(x => ({ domain: String(x.domain).trim().toLowerCase().replace(/^@/, ""), types: lt(x.types) })).filter(x => x.domain && x.types.length)
  };
  if (!settings.defaultLogin.some(x => x.domain === "*")) settings.defaultLogin.push({ domain: "*", types: ["code"] });
  return { roles, perms, rules, settings };
}

function defaultAccessConfig_() {
  const keys = Object.keys(DEFAULT_ROLE_DOMAINS), perms = {};
  keys.forEach(r => perms[r] = Object.assign({}, DEFAULT_ROLE_DOMAINS[r]));
  return normAccess_({ roles: keys.map(r => ({ role: r, label: DEFAULT_LABEL[r] || r, rank: DEFAULT_RANK[r] || 99, active: true })),
                       perms, rules: DEFAULT_RULES, settings: DEFAULT_SETTINGS });
}

function readTable_(name) {
  const sh = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID).getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
  return v.slice(1).filter(r => r.some(c => c !== "")).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

function loadAccessSheets_() {                   // null = not set up yet
  const ss = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID), roles = readTable_("Roles");
  if (!ss.getSheetByName("RolePerms") || !roles.some(r => String(r.Role).trim().toLowerCase() === "admin")) return null;
  const perms = {}, st = {};
  readTable_("RolePerms").forEach(r => { const k = String(r.Role).trim().toLowerCase(); (perms[k] = perms[k] || {})[String(r.Domain).trim()] = String(r.Codes); });
  readTable_("Settings").forEach(r => st[String(r.Key).trim()] = r.Value);
  let dl = null; try { dl = st.defaultLogin ? JSON.parse(st.defaultLogin) : null; } catch (e) {}
  return normAccess_({
    roles: roles.map(r => ({ role: r.Role, label: r.Label, rank: r.Rank, active: r.Active })), perms,
    rules: readTable_("SheetRules").map(r => ({ key: r.Key, deny: r.Deny, readMin: r.ReadMin, writeMin: r.WriteMin })),
    settings: { tokenTtlMin: st.tokenTtlMin, loginTypes: st.loginTypes, defaultLogin: dl }
  });
}

function accessConfig_(fresh) {
  if (_ACFG && !fresh) return _ACFG;
  const cache = CacheService.getScriptCache(), hit = !fresh && cache.get("ACCESS_CFG");
  if (hit) return (_ACFG = JSON.parse(hit));
  const loaded = loadAccessSheets_();
  _ACFG = loaded || defaultAccessConfig_();
  _ACFG._src = loaded ? "sheets" : "defaults";
  cache.put("ACCESS_CFG", JSON.stringify(_ACFG), 600);
  return _ACFG;
}

function userCounts_() { const o = {}; listUsers_().forEach(u => o[u.Role] = (o[u.Role] || 0) + 1); return o; }

function registryDomains_() {
  const dom = {}; getSystemRegistry().forEach(e => { const d = Object.keys(e)[0]; dom[d] = Object.keys(e[d].sheets || {}); });
  return dom;
}

function validateAccess_(draft) {                // strict checks for saves; returns the normalised config
  const n = normAccess_(draft), dom = registryDomains_(), keys = n.roles.map(r => r.role);
  n.roles.forEach(r => {
    if (!/^[a-z][a-z0-9_]{1,19}$/.test(r.role)) throw new Error("Invalid role key: " + r.role + " (a-z, 0-9, _ ; 2-20 chars)");
    if (!r.label) throw new Error("Role needs a label: " + r.role);
  });
  Object.keys(n.perms).forEach(r => Object.keys(n.perms[r]).forEach(d => {
    if (!dom[d]) throw new Error("Unknown domain: " + d);
    if (d === "audit" && /[wd]/.test(n.perms[r][d])) throw new Error("The audit domain is read-only for non-admin roles");
  }));
  n.rules.forEach(x => {
    const [d, s] = x.key.split("|");
    if (!dom[d] || !dom[d].includes(s)) throw new Error("Unknown sheet: " + x.key);
    [x.readMin, x.writeMin].forEach(m => { if (m && !keys.includes(m)) throw new Error("Unknown role in rule " + x.key + ": " + m); });
  });
  const counts = userCounts_(), gone = accessConfig_(true).roles.map(r => r.role).filter(r => !keys.includes(r) && counts[r]);
  if (gone.length) throw new Error("Can't delete role(s) that still have users: " + gone.join(", "));
  return n;
}

function flatAccess_(c) {
  const o = {};
  c.roles.forEach(r => o["role " + r.role] = r.label + ", rank " + r.rank + (r.active ? "" : ", disabled"));
  Object.keys(c.perms).forEach(r => Object.keys(c.perms[r]).forEach(d => o["perm " + r + " / " + d] = c.perms[r][d]));
  c.rules.forEach(x => o["rule " + x.key] = x.deny ? "deny" : "read>=" + (x.readMin || "any") + " write>=" + (x.writeMin || "any"));
  o["setting tokenTtlMin"] = String(c.settings.tokenTtlMin);
  o["setting loginTypes"] = c.settings.loginTypes.join(",");
  c.settings.defaultLogin.forEach(x => o["setting defaultLogin " + x.domain] = x.types.join(","));
  return o;
}
function diffAccess_(a, b) {
  const x = flatAccess_(a), y = flatAccess_(b), v = k => k === undefined ? "(none)" : k;
  return [...new Set(Object.keys(x).concat(Object.keys(y)))].sort().filter(k => x[k] !== y[k]).map(k => k + ": " + v(x[k]) + " -> " + v(y[k]));
}

function writeTable_(name, headers, rows) {
  const ss = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID), sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
}
function lastVersion_() { const h = readTable_("AccessHistory"); return h.length ? Number(h[h.length - 1].Version) : 0; }
function addHistory_(ver, summary, cfg) {
  const ss = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID), sh = ss.getSheetByName("AccessHistory") || ss.insertSheet("AccessHistory");
  if (!sh.getLastRow()) { sh.appendRow(["Version", "Timestamp", "User", "Summary", "Snapshot"]); sh.setFrozenRows(1); }
  sh.appendRow([ver, new Date().toISOString(), CURRENT_USER, String(summary).slice(0, 1000), JSON.stringify(clean_(cfg))]);
  if (sh.getLastRow() > 51) sh.deleteRows(2, sh.getLastRow() - 51);          // keep the last 50 versions
}

function previewAccess_(draft) {
  const cur = accessConfig_(true), d = diffAccess_(cur, validateAccess_(draft));
  return d.length || cur._src === "sheets" ? d : ["Create the config sheets from the built-in defaults"];
}

function saveAccessConfig_(draft) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const cur = accessConfig_(true), n = validateAccess_(draft), diff = diffAccess_(cur, n);
    if (!diff.length && cur._src === "sheets") return { version: lastVersion_(), changes: 0 };
    let ver = lastVersion_();
    if (!ver) addHistory_(ver = 1, "Initial snapshot (before first save)", cur);
    const perms = [];
    Object.keys(n.perms).forEach(r => Object.keys(n.perms[r]).forEach(d => perms.push([r, d, n.perms[r][d]])));
    writeTable_("Roles", ["Role", "Label", "Rank", "Active"], n.roles.map(r => [r.role, r.label, r.rank, r.active]));
    writeTable_("RolePerms", ["Role", "Domain", "Codes"], perms);
    writeTable_("SheetRules", ["Key", "Deny", "ReadMin", "WriteMin"], n.rules.map(x => [x.key, x.deny, x.readMin, x.writeMin]));
    writeTable_("Settings", ["Key", "Value"], [["tokenTtlMin", n.settings.tokenTtlMin], ["loginTypes", n.settings.loginTypes.join(",")],
                                              ["defaultLogin", JSON.stringify(n.settings.defaultLogin)]]);
    addHistory_(++ver, (diff.length || "Initial") + " change(s): " + diff.join("; "), n);
    CacheService.getScriptCache().remove("ACCESS_CFG"); _ACFG = null;
    auditLog("update", "audit", "Access", "v" + ver, "Access config", "", diff.join("; ").slice(0, 3000), "Success");
    return { version: ver, changes: diff.length };
  } finally { lock.releaseLock(); }
}

function getAccessConfig_(fresh) {
  const c = accessConfig_(fresh === true || fresh === "true"), dom = registryDomains_(), cfg = JSON.parse(JSON.stringify(clean_(c)));
  Object.values(cfg.perms).forEach(p => Object.keys(p).forEach(d => { if (!dom[d]) delete p[d]; }));   // domains no longer in the registry
  return { config: cfg, source: c._src, version: lastVersion_(), domains: dom, userCounts: userCounts_(), loginUniverse: LOGIN_UNIVERSE,
    locked: { publicActions: PUBLIC_ACTIONS, adminOnly: ADMIN_ONLY, anyRole: ANY_ROLE, actionCode: ACTION_CODE, denySheets: DENY_SHEETS } };
}

function listAccessHistory_() {
  return readTable_("AccessHistory").map(r => ({ Version: r.Version, Timestamp: r.Timestamp instanceof Date ? r.Timestamp.toISOString() : String(r.Timestamp),
    User: r.User, Summary: r.Summary })).reverse();
}
function getAccessVersion_(v) {
  if (v === "defaults") return clean_(defaultAccessConfig_());
  const r = readTable_("AccessHistory").find(x => String(x.Version) === String(v));
  if (!r) throw new Error("Version not found");
  return clean_(normAccess_(JSON.parse(r.Snapshot)));
}