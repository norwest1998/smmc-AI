/* scoring.gs
 * Low-point scoring and discard logic. 1=1pt, 2=2pt... DNF/DNS assigned penalty = competitors+1
 */
function buildScoresFromRaces(parsed, masterData) {

  /* ---------------------------
   * Find class & roster
   * --------------------------- */
  const classEntry = Object.values(masterData.classesById)
    .find(c => c.classname.toLowerCase() === (parsed.className || '').toLowerCase());

  if (!classEntry)
    throw new Error('Class not found: ' + parsed.className);

  const classname = classEntry.classname;
  const classRoster = masterData.classMembersMap[classname] || [];

  if (classRoster.length === 0)
    throw new Error('No competitors for class: ' + classname);

  /* ---------------------------
   * Initialize scores from roster
   * --------------------------- */
  const scores = {};
  classRoster.forEach(e => {
    const sail = e.sailnumber.toString().trim();
    scores[sail] = {
      sail: sail,
      member: e.membername,
      placements: [],
      gross: 0
    };
  });

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
        sailedSet.add(entry.sailNumber.toString().trim());
      }
    });
  });

  const regattaCompetitorCount = sailedSet.size;

  /* ---------------------------
   * Penalty values
   * --------------------------- */
  const PENALTIES = {
    DNS: regattaCompetitorCount + 1,
    DNF: regattaCompetitorCount + 1,
    DNC: regattaCompetitorCount + 1
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
    const participated = sailedSet.has(sail);

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

      } else if (!participated) {
        // Never raced in regatta
        placement = 'DNC';
        scoreVal = PENALTIES.DNC;

      } else {
        // Raced at least once, but missed this race
        placement = 'DNS';
        scoreVal = PENALTIES.DNS;
      }

      sc.placements[r] = placement;
      sc.gross += scoreVal;
    }
  });

  /* ---------------------------
   * Discards & totals
   * --------------------------- */
  const discardCount = determineDiscardCount(raceCount);

  Object.values(scores).forEach(sc => {
    const numeric = sc.placements.map(p =>
      typeof p === 'number' ? p : PENALTIES.DNC
    );

    const discardsSum = numeric
      .slice()
      .sort((a, b) => b - a)
      .slice(0, discardCount)
      .reduce((a, b) => a + b, 0);

    sc.discards = discardsSum;
    sc.total = sc.gross - discardsSum;
    sc.raceCount = raceCount;
    sc.regattaCompetitors = regattaCompetitorCount;
  });

return applyTieBreaksWithExAequo(scores);

}

function determineDiscardCount(raceCount){
  if(!raceCount || raceCount<4) return 0;
  return 1 + Math.floor(raceCount / 8);
}

function compareWithTieBreak(a, b, penalty) {

  // Total
  if (a.total !== b.total) {
    return a.total - b.total;
  }

  // A8.1: sorted scores
  const aScores = normalizePlacements(a.placements, penalty).slice().sort((x,y)=>x-y);
  const bScores = normalizePlacements(b.placements, penalty).slice().sort((x,y)=>x-y);

  for (let i = 0; i < aScores.length; i++) {
    if (aScores[i] !== bScores[i]) {
      return aScores[i] - bScores[i];
    }
  }

  // A8.2: last race backwards
  for (let r = a.placements.length - 1; r >= 0; r--) {
    const av = typeof a.placements[r] === 'number' ? a.placements[r] : penalty;
    const bv = typeof b.placements[r] === 'number' ? b.placements[r] : penalty;
    if (av !== bv) return av - bv;
  }

  // Fully tied
  return 0;
}

function normalizePlacements(placements, penalty) {
  return placements.map(p =>
    typeof p === 'number' ? p : penalty
  );
}

function applyTieBreaksWithExAequo(scoresMap) {

  const list = Object.values(scoresMap);
  const penalty = list[0].regattaCompetitors + 1;

  // Sort using full tie-break logic
  list.sort((a,b) => compareWithTieBreak(a, b, penalty));

  let place = 1;
  let i = 0;

  while (i < list.length) {
    let tiedGroup = [list[i]];
    let j = i + 1;

    // Find all boats fully tied with this one
    while (
      j < list.length &&
      compareWithTieBreak(list[i], list[j], penalty) === 0
    ) {
      tiedGroup.push(list[j]);
      j++;
    }

    // Assign placings
    if (tiedGroup.length === 1) {
      tiedGroup[0].place = place;
    } else {
      tiedGroup.forEach(b => b.place = `${place}=`);
    }

    place += tiedGroup.length;
    i = j;
  }

  return list;
}

