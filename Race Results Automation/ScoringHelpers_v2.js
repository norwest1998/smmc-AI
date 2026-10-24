/**
 * Scoring system values may be stored as 'low_point', 'lowPoint', 'high_point', 'highPoint' ...
 * Normalises to 'lowpoint' | 'highpoint'.
 */
function normScoring_v2(v) {
  const s = String(v || 'lowpoint').toLowerCase().replace(/[^a-z]/g, '');
  return s === 'highpoint' ? 'highpoint' : 'lowpoint';
}
function isHighPoint_v2(scoringSystem) {
  return normScoring_v2(scoringSystem) === 'highpoint';
}

/**
 * Calculates number of discards allowed based on raceCount and a comma-delimited threshold string.
 * Example rule: "4, 8, 16, 24" -> 1 discard at 4 races, 2 at 8, 3 at 16, 4 at 24.
 */
function getDiscardCount_v2(raceCount, discardsRuleStr) {
  if (!discardsRuleStr || typeof discardsRuleStr !== 'string') {
    // Default standard rule: 1 at 4, 2 at 8, +1 every 8 thereafter
    if (raceCount < 4) return 0;
    if (raceCount < 8) return 1;
    return 2 + Math.floor((raceCount - 8) / 8);
  }

  // Racing Management stores "drop N after M races" as JSON, e.g. {"drop":1,"after":5}
  const rule = discardsRuleStr.trim();
  if (rule.charAt(0) === '{') {
    try {
      const o = JSON.parse(rule);
      return raceCount >= (Number(o.after) || 1) ? (Number(o.drop) || 0) : 0;
    } catch (e) {
      return 0;
    }
  }

  const thresholds = discardsRuleStr
    .split(',')
    .map(val => Number(val.trim()))
    .filter(val => !isNaN(val) && val > 0)
    .sort((a, b) => a - b);

  let drops = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (raceCount >= thresholds[i]) {
      drops = i + 1;
    } else {
      break;
    }
  }
  return drops;
}

/**
 * Resolves bracket column identifier for competitor count.
 */
function getAdjustmentBracket_v2(competitorCount) {
  if (competitorCount < 4) return '<4';
  if (competitorCount < 7) return '<7';
  if (competitorCount < 13) return '<13';
  return '13+';
}

/**
 * Resolves token from formula layout.
 */
function resolveFormulaToken_v2(position, competitorCount, tokens) {
  const last = competitorCount;
  if (position === last) return 'L';

  if (position <= tokens.length) {
    const token = tokens[position - 1];
    if (token !== 'L') return token;
  }

  const offset = last - position;
  const offsetToken = `L-${offset}`;
  return tokens.includes(offsetToken) ? offsetToken : 'n';
}

/**
 * Dynamic handicap adjustment calculation driven solely by RaceSpec.config.
 */
function getHcapAdjustment_v2({ position, competitorCount, raceSpec }) {
  if (!raceSpec || raceSpec.raceType !== 'handicap') {
    return 0;
  }

  const config = raceSpec.config || {};
  const formulaStr = config.formula || '1, 2, 3, 4, n, L-2, L-1, L';
  const tokens = formulaStr.split(',').map(s => s.trim());
  const bracketKey = getAdjustmentBracket_v2(competitorCount);

  let bracketValues = [];
  if (config.brackets && config.brackets[bracketKey]) {
    bracketValues = String(config.brackets[bracketKey]).split(',').map(Number);
  } else if (config[bracketKey]) {
    bracketValues = String(config[bracketKey]).split(',').map(Number);
  } else {
    return 0;
  }

  const token = resolveFormulaToken_v2(position, competitorCount, tokens);
  let index = tokens.indexOf(token);

  if (index === -1) {
    if (position === competitorCount) {
      index = tokens.length - 1;
    } else {
      const nIndex = tokens.indexOf('n');
      index = nIndex !== -1 ? nIndex : Math.min(4, tokens.length - 1);
    }
  }

  if (index < 0 || index >= bracketValues.length) return 0;
  const adj = bracketValues[index];
  return isNaN(adj) ? 0 : adj;
}

/**
 * Computes net score and discards flags with low-point or high-point handling.
 */
function calculateNetWithDiscards_v2(raceScores, discardCount, scoringSystem) {
  const isHighPoint = isHighPoint_v2(scoringSystem);
  const round2 = n => Math.round(n * 100) / 100;      // weighted points are fractional
  const gross = round2(raceScores.reduce((sum, s) => sum + s, 0));

  const indexed = raceScores.map((score, index) => ({ score, index }));

  // Low point: discard highest score (worst). High point: discard lowest score (worst).
  if (isHighPoint) {
    indexed.sort((a, b) => a.score - b.score);
  } else {
    indexed.sort((a, b) => b.score - a.score);
  }

  const discardFlags = new Array(raceScores.length).fill(false);
  let discardSum = 0;

  const n = Math.min(discardCount, indexed.length);
  for (let i = 0; i < n; i++) {
    discardFlags[indexed[i].index] = true;
    discardSum += indexed[i].score;
  }

  return {
    gross,
    net: round2(gross - discardSum),
    discardSum: round2(discardSum),
    discardFlags
  };
}