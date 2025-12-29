/**
* Scoring routines — low-point system with discards
*/
function buildScoresFromRaces(parsed, members) {

  /* ---------------------------
   * Create roster
   * --------------------------- */
  const classname = parsed.className;

  if (members.length === 0)
    throw new Error('No competitors for class: ' + classname);

  /* ---------------------------
   * Determine race count
   * --------------------------- */
  const raceCount = Math.max(
    ...parsed.races.map(r => r.positions.length)
  );

  /* ---------------------------
   * Determine who raced at least once
   * --------------------------- */
  const sailedSet = new Set();

  parsed.races.forEach(entry => {
    entry.positions.forEach(p => {
      if (typeof p === 'number' && p > 0) {
        sailedSet.add(entry.sailNumber);
      }
    });
  });

  /* ---------------------------
   * Initialize scores from sailedSet
   * --------------------------- */

  const memberLookupMap = new Map();
  for (const member of members) {
    const sailNumberString = String(member.sailnumber);
    memberLookupMap.set(sailNumberString, member);
  }

  const scores = [];
  sailedSet.forEach(sailNumber => {
    const member = memberLookupMap.get(sailNumber);
    scores.push({
      sail: sailNumber,
      member: member ? member.membername : "",
      boatId: member ? member.boatId : "",   // ✅ added
      placements: [],
      racescore: [],
      gross: 0
    });
  });



  /* ---------------------------
   * Penalty values
   * --------------------------- */
  const PENALTIES = {
    DNS: +parsed.competitorCount + 1,
    DNF: +parsed.competitorCount + 1,
    DNC: +parsed.competitorCount + 1
  };

  /* ---------------------------
   * Race averages for RO
   * --------------------------- */
  const raceAverages = [];

  for (let r = 0; r < raceCount; r++) {
    const finishes = [];

    parsed.races.forEach(entry => {
      const val = entry.positions[r];
      if (typeof val === 'number' && val > 0) {
        finishes.push(val);
      }
    });

    raceAverages[r] = finishes.length
      ? Math.round(finishes.reduce((a, b) => a + b, 0) / finishes.length)
      : PENALTIES.DNC;
  }

  /* ---------------------------
   * Apply scoring
   * --------------------------- */
  Object.values(scores).forEach(sc => {
    const sail = sc.sail;
    const entry = parsed.races.find(r => r.sailNumber.toString().trim() === sail);

    for (let r = 0; r < raceCount; r++) {
      const val = entry?.positions?.[r];
      let placement, scoreVal;

      if (typeof val === 'number' && val > 0) {
        placement = val;
        scoreVal = val;

      } else if (['DNS', 'DNF', 'DNC'].includes((val || '').toUpperCase())) {
        placement = val.toUpperCase();
        scoreVal = PENALTIES[placement];

      } else if ((val || '').toUpperCase() === 'RO') {
        placement = 'RO';
        scoreVal = raceAverages[r];

      } 

      sc.placements[r] = placement
      sc.racescore[r] = scoreVal;
      sc.gross += scoreVal;
    }
  });

  /* ---------------------------
   * Discards & totals
   * --------------------------- */
  const discardCount = getDiscardCount(raceCount);

  scores.forEach(sc => {
    // 1. Map scores to objects so we can track their original index after sorting
    const indexedScores = sc.racescore.map((score, index) => ({
      score: score,
      index: index
    }));

    // 2. Sort by score descending (highest scores first are the candidates for discard)
    indexedScores.sort((a, b) => b.score - a.score);

    // 3. Initialize the discards array with 'false' for all races
    sc.discards = new Array(raceCount).fill(false);
    let discardedSum = 0;

    // 4. Mark the top N scores as discarded
    for (let i = 0; i < discardCount; i++) {
      const discardIndex = indexedScores[i].index;
      sc.discards[discardIndex] = true; // Mark this specific race as a discard
      discardedSum += indexedScores[i].score;
    }

    // 5. Calculate net total
    sc.net = sc.gross - discardedSum;
  });

  return scores;
}

