function _sig(b) {
  const secret = PropertiesService.getScriptProperties().getProperty("TOKEN_SECRET");
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(b, secret));
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
