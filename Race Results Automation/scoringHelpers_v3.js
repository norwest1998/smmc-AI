/**
 * scoringHelpers_v3.js — discard rules and handicap config in the formats used by the Racing Formats workbook.
 */

/**
 * Discards allowed after `raceCount` races. Accepts:
 *   {"thresholds":[4]}        1 discard once 4 races are sailed ([4,8] = 2 at 8 ...)
 *   {"drop":2,"after":8}      drop 2 once 8 races are sailed
 *   "4, 8, 16, 24"            legacy list; blank = club default (1 at 4, 2 at 8, +1 every 8)
 */
function getDiscardCount_v3(raceCount, rule) {
  const r = String(rule == null ? '' : rule).trim();
  if (r.charAt(0) === '{') {
    try {
      const o = JSON.parse(r);
      if (Array.isArray(o.thresholds)) {
        return o.thresholds.map(Number).filter(n => n > 0 && raceCount >= n).length;
      }
      if (o.drop !== undefined) {
        return raceCount >= (Number(o.after) || 1) ? (Number(o.drop) || 0) : 0;
      }
    } catch (e) {
      Logger.log('getDiscardCount_v3: unreadable discardsRule ' + r);
      return 0;
    }
  }
  return getDiscardCount_v2(raceCount, r);
}

/**
 * Handicap adjustment for a finishing position. Spec config shape:
 *   { "method":"start_offset", "positions":["1","2","3","4","n","L-3","L-2","L-1","L"],
 *     "brackets": { "<4":[10,5,0,...], "<7":[...], "<13":[...], "13+":[...] } }
 * (older shapes - "formula" string and comma-string brackets - still work)
 */
function getHcapAdjustment_v3({ position, competitorCount, raceSpec }) {
  if (!raceSpec || raceSpec.raceType !== 'handicap') return 0;
  const c = raceSpec.config || {};
  const tokens = Array.isArray(c.positions)
    ? c.positions.map(t => String(t).trim())
    : String(c.formula || '1, 2, 3, 4, n, L-2, L-1, L').split(',').map(s => s.trim());

  const key = getAdjustmentBracket_v2(competitorCount);
  const raw = (c.brackets && c.brackets[key] !== undefined) ? c.brackets[key] : c[key];
  if (raw === undefined || raw === null || raw === '') return 0;
  const values = (Array.isArray(raw) ? raw : String(raw).split(',')).map(Number);

  const token = resolveFormulaToken_v2(position, competitorCount, tokens);
  let index = tokens.indexOf(token);
  if (index === -1) {
    if (position === competitorCount) index = tokens.length - 1;
    else { const n = tokens.indexOf('n'); index = n !== -1 ? n : Math.min(4, tokens.length - 1); }
  }
  if (index < 0 || index >= values.length) return 0;
  return isNaN(values[index]) ? 0 : values[index];
}

/* ---------- scoring-system helpers (v3 is independent of the patched v2 helpers) ---------- */

/** 'low_point' / 'lowPoint' / 'high_point' / 'highPoint' ... -> 'lowpoint' | 'highpoint' */
function normScoring_v3(v) {
  const s = String(v || 'lowpoint').toLowerCase().replace(/[^a-z]/g, '');
  return s === 'highpoint' ? 'highpoint' : 'lowpoint';
}
function isHighPoint_v3(scoringSystem) {
  return normScoring_v3(scoringSystem) === 'highpoint';
}

/** Net score and discard flags. Low-point drops the highest scores, high-point drops the lowest. */
function calculateNetWithDiscards_v3(raceScores, discardCount, scoringSystem) {
  const high = isHighPoint_v3(scoringSystem);
  const round2 = n => Math.round(n * 100) / 100;       // weighted points are fractional
  const gross = round2(raceScores.reduce((sum, s) => sum + s, 0));
  const indexed = raceScores.map((score, index) => ({ score, index }));
  indexed.sort((a, b) => high ? a.score - b.score : b.score - a.score);

  const discardFlags = new Array(raceScores.length).fill(false);
  let discardSum = 0;
  const n = Math.min(discardCount, indexed.length);
  for (let i = 0; i < n; i++) {
    discardFlags[indexed[i].index] = true;
    discardSum += indexed[i].score;
  }
  return { gross, net: round2(gross - discardSum), discardSum: round2(discardSum), discardFlags };
}