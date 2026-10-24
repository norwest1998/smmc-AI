/**
 * Ties broken strictly under RRS Appendix A8 using raw finish placements,
 * not weighted or handicap-adjusted race scores.
 */
function rankScoresMap_v2(scoreMap, scoringSystem = 'lowpoint') {
  scoringSystem = normScoring_v2(scoringSystem);     // accepts 'high_point' / 'highPoint' etc.
  const ranked = [...scoreMap].sort((a, b) => compareCompetitors_v2(a, b, scoringSystem));

  let currentRank = 1;
  if (ranked.length > 0) {
    ranked[0].rank = currentRank;
  }

  for (let i = 1; i < ranked.length; i++) {
    const prev = ranked[i - 1];
    const curr = ranked[i];

    if (compareCompetitors_v2(prev, curr, scoringSystem) === 0) {
      curr.rank = prev.rank; // Tied
    } else {
      currentRank = i + 1;
      curr.rank = currentRank;
    }
  }

  return ranked;
}

function compareCompetitors_v2(a, b, scoringSystem) {
  // 1. Primary: Net score (low-point ascending, high-point descending)
  if (a.net !== b.net) {
    return scoringSystem === 'highpoint' ? b.net - a.net : a.net - b.net;
  }

  // 2. A8.1: Most best finishes compared using raw placements
  const a81 = compareA81_v2(a, b);
  if (a81 !== 0) return a81;

  // 3. A8.2: Better placement in last race, working backwards
  const a82 = compareA82_v2(a, b);
  if (a82 !== 0) return a82;

  return 0;
}

function normalizePlacement_v2(p) {
  return typeof p === 'number' ? p : 9999;
}

function compareA81_v2(a, b) {
  const aPlaces = a.placements.map(normalizePlacement_v2).sort((x, y) => x - y);
  const bPlaces = b.placements.map(normalizePlacement_v2).sort((x, y) => x - y);

  for (let i = 0; i < Math.min(aPlaces.length, bPlaces.length); i++) {
    if (aPlaces[i] !== bPlaces[i]) {
      return aPlaces[i] - bPlaces[i]; // Lower raw position is better
    }
  }
  return 0;
}

function compareA82_v2(a, b) {
  for (let i = a.placements.length - 1; i >= 0; i--) {
    const pA = normalizePlacement_v2(a.placements[i]);
    const pB = normalizePlacement_v2(b.placements[i]);
    if (pA !== pB) {
      return pA - pB; // Lower raw position in latest race wins tie-break
    }
  }
  return 0;
}