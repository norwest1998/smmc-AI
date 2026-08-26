function rankScoresMap(scoreMap) {
  // Clone to avoid mutating original
  const ranked = [...scoreMap].sort(compareCompetitors);

  let currentRank = 1;
  ranked[0].rank = currentRank;

  for (let i = 1; i < ranked.length; i++) {
    const prev = ranked[i - 1];
    const curr = ranked[i];

    if (compareCompetitors(prev, curr) === 0) {
      // Ex Aequo
      curr.rank = prev.rank;
    } else {
      currentRank = i + 1;
      curr.rank = currentRank;
    }
  }

  return ranked;
}

function compareCompetitors(a, b) {
  // 1. Total score
  if (a.net !== b.net) {
    return a.net - b.net;
  }

  // 2. A8.1 – best scores
  const a81 = compareA81(a, b);
  if (a81 !== 0) return a81;

  // 3. A8.2 – last race, then backwards
  const a82 = compareA82(a, b);
  if (a82 !== 0) return a82;

  // 4. Ex Aequo
  return 0;
}

function compareA81(a, b) {
  const as = [...a.racescore].sort((x, y) => x - y);
  const bs = [...b.racescore].sort((x, y) => x - y);

  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] !== bs[i]) {
      return as[i] - bs[i]; // lower is better
    }
  }
  return 0;
}

function compareA82(a, b) {
  for (let i = a.racescore.length - 1; i >= 0; i--) {
    if (a.racescore[i] !== b.racescore[i]) {
      return a.racescore[i] - b.racescore[i];
    }
  }
  return 0;
}
