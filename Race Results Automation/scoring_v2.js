/**
 * Maps incoming races 1-to-1 against sequential RaceSpecs.
 */
function expandRaceSpecs_v2(raceSpecs, totalRaces) {
  const expanded = [];
  for (const spec of raceSpecs) {
    const repeatCount = spec.count || 1;
    for (let i = 0; i < repeatCount; i++) {
      expanded.push(spec);
      if (expanded.length === totalRaces) break;
    }
    if (expanded.length === totalRaces) break;
  }

  // If parsed has more races than configured specs, stretch the final spec or default
  while (expanded.length < totalRaces) {
    const lastSpec = raceSpecs[raceSpecs.length - 1] || {
      raceType: 'scratch',
      weight: 1.0,
      config: {}
    };
    expanded.push(lastSpec);
  }

  return expanded;
}

/**
 * Core scoring calculation function for v2 engine.
 */
function buildScoresFromRaces_v2(parsed, membersData, racingFormat) {
  const classname = parsed.className;
  if (!membersData || membersData.length === 0) {
    throw new Error('buildScoresFromRaces_v2: No competitors for class ' + classname);
  }

  const raceData = parsed.races || [];
  const raceCount = raceData.length;
  const competitorCount = Number(parsed.competitorCount) || membersData.length;
  const scoringSystem = normScoring_v2(racingFormat.scoringSystem);

  // Participation-weighted series (entry required + format.participationWeighting). null = normal scoring.
  const series = getSeriesScoringConfig_v2(parsed.regattaName, racingFormat);
  if (series && series.provisional)
    Logger.log(`WARNING: ${parsed.regattaName} field not frozen - scoring with ${series.eligible} eligible starters (provisional).`);

  // 1. Expand RaceSpecs sequentially
  const activeRaceSpecs = expandRaceSpecs_v2(racingFormat.raceSpecs || [], raceCount);

  // 2. Index Roster
  const membersLookup = {};
  membersData.forEach(m => {
    if (m.sailnumber) membersLookup[m.sailnumber] = m;
  });

  const allSailNumbers = new Set();
  raceData.forEach(race => {
    (race.positions || []).forEach(sail => allSailNumbers.add(sail));
    if (race.dns) (Array.isArray(race.dns) ? race.dns : [race.dns]).forEach(s => s && allSailNumbers.add(s));
    if (race.dnf) (Array.isArray(race.dnf) ? race.dnf : [race.dnf]).forEach(s => s && allSailNumbers.add(s));
    if (race.raceRO) (Array.isArray(race.raceRO) ? race.raceRO : [race.raceRO]).forEach(s => s && allSailNumbers.add(s));
  });

  const sailResults = {};
  allSailNumbers.forEach(sailNum => {
    const mem = membersLookup[sailNum];
    sailResults[sailNum] = {
      sail: sailNum,
      member: mem ? mem.membername : `Unknown (${sailNum})`,
      boatId: mem ? mem.boatId : "",
      hcap: mem ? mem.hcap : 0,
      adj: 0,
      placements: [],
      racescore: [],
      gross: 0,
      net: 0
    };
  });

  // 3. Process Individual Races
  raceData.forEach((race, rIdx) => {
    const raceSpec = activeRaceSpecs[rIdx];
    const weight = raceSpec.weight || 1.0;
    const isHandicapRace = raceSpec.raceType === 'handicap';

    // Series mode: competitors in THIS race = finishers + DNS
    const dnsListForCount = Array.isArray(race.dns) ? race.dns : (race.dns ? [race.dns] : []);
    const raceCompetitors = (race.positions || []).length + dnsListForCount.filter(Boolean).length;

    const defaultPenaltyPos = competitorCount + 1;
    const penaltyPoints = scoringSystem === 'highpoint'
      ? 0
      : defaultPenaltyPos * weight;

    // Process Finishers
    (race.positions || []).forEach((sailNum, idx) => {
      const position = idx + 1;
      sailResults[sailNum].placements.push(position);
      if (series) {
        // (competitors / eligible) x (eligible - position + 1) x spec weight
        sailResults[sailNum].racescore.push(RacingScoring.points({
          position, competitors: raceCompetitors, eligible: series.eligible, weight
        }));
      } else {
        const basePoints = scoringSystem === 'highpoint'
          ? Math.max(1, competitorCount - position + 1)
          : position;
        sailResults[sailNum].racescore.push(basePoints * weight);
      }

      // Handicap isolation: strictly applies only if raceSpec is handicap
      if (isHandicapRace) {
        const adj = getHcapAdjustment_v2({
          position,
          competitorCount,
          raceSpec
        });
        sailResults[sailNum].adj += adj;
      }
    });

    // Process DNS
    const dnsSails = Array.isArray(race.dns) ? race.dns : (race.dns ? [race.dns] : []);
    dnsSails.forEach(sailNum => {
      if (sailNum && sailResults[sailNum]) {
        sailResults[sailNum].placements.push('DNS');
        sailResults[sailNum].racescore.push(penaltyPoints);
      }
    });

    // Process DNF
    const dnfSails = Array.isArray(race.dnf) ? race.dnf : (race.dnf ? [race.dnf] : []);
    dnfSails.forEach(sailNum => {
      if (sailNum && sailResults[sailNum]) {
        sailResults[sailNum].placements.push('DNF');
        sailResults[sailNum].racescore.push(penaltyPoints);
      }
    });

    // Process Race Officer (RO)
    const roSails = Array.isArray(race.raceRO) ? race.raceRO : (race.raceRO ? [race.raceRO] : []);
    roSails.forEach(sailNum => {
      if (sailNum && sailResults[sailNum]) {
        const otherScores = sailResults[sailNum].racescore.filter(s => typeof s === 'number' && (!series || s > 0));
        let avgScore;
        if (otherScores.length > 0) {
          const mean = otherScores.reduce((a, b) => a + b, 0) / otherScores.length;
          avgScore = series ? Math.round(mean * 100) / 100 : Math.round(mean);
        } else if (series) {
          avgScore = RacingScoring.points({
            position: Math.ceil(raceCompetitors / 2), competitors: raceCompetitors, eligible: series.eligible, weight
          });
        } else {
          avgScore = Math.round(defaultPenaltyPos / 2) * weight;
        }

        sailResults[sailNum].placements.push('RO');
        sailResults[sailNum].racescore.push(avgScore);
      }
    });
  });

  // 4. Calculate Net Points and Discards
  const discardCount = getDiscardCount_v2(raceCount, racingFormat.discardsRule);
  const scores = Object.values(sailResults);

  scores.forEach(sc => {
    const { gross, net, discardFlags } = calculateNetWithDiscards_v2(
      sc.racescore,
      discardCount,
      scoringSystem
    );
    sc.gross = gross;
    sc.net = net;
    sc.discards = discardFlags;
  });

  const updatedHandicaps = scores.map(r => ({
    member: r.member,
    boatId: r.boatId,
    hcap: r.hcap,
    adj: r.adj
  }));

  return {
    scores,
    updatedHandicaps,
    activeRaceSpecs,
    series
  };
}