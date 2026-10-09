const GOOGLE_CLIENT_ID = "738246015685-4vk2o2l7nit598jvkl8r423sa4hff8rf.apps.googleusercontent.com";
const TOKEN_TTL_MS     = 60 * 60 * 1000;
const PUBLIC_ACTIONS = ["login", "requestCode", "verifyCode", "passwordLogin", "appendAvgScrReq"];
const DENY_SHEETS      = ["apps|Tokens", "audit|Users"];
const PERMS = { viewer:["read"], editor:["read","write"], admin:["read","write","delete","admin"] };
const ROLE_DOMAINS = {
  viewer: { members:"r", documents:"r", calendar:"r", notes:"r", results:"r", tracking:"r" },
  editor: { members:"rw", documents:"rw", calendar:"rw", notes:"rw", results:"rw", tracking:"rw", apps:"rw", requests:"rw" },
  admin:  { members:"rwd", documents:"rwd", calendar:"rwd", notes:"rwd", results:"rwd", tracking:"rwd",
            apps:"rwd", requests:"rwd", audit:"rwd" }
};
const ACTION_CODE = { fetch:"r", batchFetch:"r", layout:"r", append:"w", update:"w", delete:"d" };
const ANY_ROLE    = ["getRegistry", "registerSchema", "changePassword"];
const ADMIN_ONLY  = ["refreshCache", "resetPassword"];
const ACTION_TYPE = {
  fetch:"read", batchFetch:"read", layout:"read", getRegistry:"read", registerSchema:"read",
  append:"write", update:"write", delete:"delete", refreshCache:"admin"
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
  const exp = Date.now() + TOKEN_TTL_MS;
  return { token: signToken({ email: g.email.toLowerCase(), role: u.role, exp }),
           email: g.email, name: u.name, role: u.role, exp };
}

// returns null if allowed, else an error response
function authorize(action, payload) {
  if (PUBLIC_ACTIONS.includes(action)) { CURRENT_USER = "public"; return null; }
  const p = verifyToken(payload.token);
  const u = p && lookupUser(p.email);
  if (!u) return json({ code: "AUTH", error: "Unauthorized" });
  if (p.mc && action !== "changePassword") return json({ code: "AUTH", error: "Password change required" });
  const known = action in ACTION_CODE || ANY_ROLE.includes(action) || ADMIN_ONLY.includes(action) || action === "aryaResults";
  if (!known || !ROLE_DOMAINS[u.role] || (ADMIN_ONLY.includes(action) && u.role !== "admin"))
    return json({ code: "FORBIDDEN", error: "Forbidden" });
  CURRENT_USER = p.email; CURRENT_ROLE = u.role;
  return null;
}

function checkAccess(domain, sheet, code) {
  sheet = sheet || getRegistryEntry(domain).defaultSheet;
  if (DENY_SHEETS.includes(domain + "|" + sheet)) throw new Error("Forbidden");
  if (!(ROLE_DOMAINS[CURRENT_ROLE]?.[domain] || "").includes(code)) throw new Error("Forbidden: " + domain);
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
  const exp = Date.now() + TOKEN_TTL_MS;
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
  const exp = Date.now() + TOKEN_TTL_MS;
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
