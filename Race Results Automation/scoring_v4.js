/**
 * scoring_v4.js — core scoring keyed by BOAT ID (positions / dns / dnf / raceRO hold boatIds).
 * Sail and member come from parsed.entries; the starting handicap comes from the roster (by boatId).
 * Everything else (scoring system, weights, participation, discards, handicap adjustments) is unchanged from scoring_v3.
 * Reuses: expandRaceSpecs_v2, normScoring_v3, getSeriesScoringConfig_v3, RacingScoringV3, getHcapAdjustment_v3,
 *         getDiscardCount_v3, calculateNetWithDiscards_v3.
 */
function buildScoresFromRaces_v4(parsed, roster, series) {
  const racingFormat = series.resolvedFormat;
  const entries = parsed.entries || [];
  if (!entries.length) throw new Error('buildScoresFromRaces_v4: no entries for ' + series.name);

  const raceData = parsed.races || [];
  const raceCount = raceData.length;
  const competitorCount = Number(parsed.competitorCount) || entries.length;
  const scoringSystem = normScoring_v3(racingFormat.scoringSystem);

  // Participation-weighted series (entry required + format.participationWeighting). null = normal scoring.
  const participation = getSeriesScoringConfig_v3(series);
  if (participation && participation.provisional)
    Logger.log(`WARNING: ${series.name} field not frozen - scoring with ${participation.eligible} eligible starters (provisional).`);

  // 1. Expand RaceSpecs sequentially
  const activeRaceSpecs = expandRaceSpecs_v2(racingFormat.raceSpecs || [], raceCount);

  // 2. Index roster and entries by boatId
  const s = x => String(x == null ? '' : x).trim();
  const asList = v => Array.isArray(v) ? v : (s(v) === '' ? [] : [v]);
  const rosterByBoat = {}, entryByBoat = {};
  (roster || []).forEach(m => { rosterByBoat[s(m.boatId)] = m; });
  entries.forEach(e => { entryByBoat[s(e.boatId)] = e; });

  const boatIds = new Set();
  raceData.forEach(race => [race.positions, race.dns, race.dnf, race.raceRO]
    .forEach(l => asList(l).forEach(id => { if (s(id)) boatIds.add(s(id)); })));

  const sailResults = {};
  boatIds.forEach(id => {
    const e = entryByBoat[id], m = rosterByBoat[id];
    if (!e) throw new Error(`Boat ${id} raced but is not in entries`);
    sailResults[id] = {
      boatId: id,
      sail: s(e.sailNo),
      member: s(e.member),
      hcap: m ? m.hcap : 0,
      adj: 0,
      placements: [],
      racescore: [],
      gross: 0,
      net: 0
    };
  });

  // 3. Process individual races
  raceData.forEach((race, rIdx) => {
    const raceSpec = activeRaceSpecs[rIdx];
    const weight = raceSpec.weight || 1.0;
    const isHandicapRace = raceSpec.raceType === 'handicap';

    const positions = asList(race.positions).map(s);
    const dnsBoats = asList(race.dns).map(s).filter(Boolean);
    const dnfBoats = asList(race.dnf).map(s).filter(Boolean);
    const roBoats = asList(race.raceRO).map(s).filter(Boolean);

    // Series mode: competitors in THIS race = finishers + DNS
    const raceCompetitors = positions.length + dnsBoats.length;

    const defaultPenaltyPos = competitorCount + 1;
    const penaltyPoints = scoringSystem === 'highpoint' ? 0 : defaultPenaltyPos * weight;

    // Finishers
    positions.forEach((boatId, idx) => {
      const position = idx + 1;
      sailResults[boatId].placements.push(position);
      if (participation) {
        // (competitors / eligible) x (eligible - position + 1) x spec weight
        sailResults[boatId].racescore.push(RacingScoringV3.points({
          position, competitors: raceCompetitors, eligible: participation.eligible, weight
        }));
      } else {
        const basePoints = scoringSystem === 'highpoint'
          ? Math.max(1, competitorCount - position + 1)
          : position;
        sailResults[boatId].racescore.push(basePoints * weight);
      }

      // Handicap isolation: applies only if the raceSpec is handicap
      if (isHandicapRace) {
        sailResults[boatId].adj += getHcapAdjustment_v3({ position, competitorCount, raceSpec });
      }
    });

    // DNS
    dnsBoats.forEach(boatId => {
      if (sailResults[boatId]) { sailResults[boatId].placements.push('DNS'); sailResults[boatId].racescore.push(penaltyPoints); }
    });

    // DNF
    dnfBoats.forEach(boatId => {
      if (sailResults[boatId]) { sailResults[boatId].placements.push('DNF'); sailResults[boatId].racescore.push(penaltyPoints); }
    });

    // Race Officer (RO): average of the boat's other scores
    roBoats.forEach(boatId => {
      if (!sailResults[boatId]) return;
      const otherScores = sailResults[boatId].racescore.filter(x => typeof x === 'number' && (!participation || x > 0));
      let avgScore;
      if (otherScores.length > 0) {
        const mean = otherScores.reduce((a, b) => a + b, 0) / otherScores.length;
        avgScore = participation ? Math.round(mean * 100) / 100 : Math.round(mean);
      } else if (participation) {
        avgScore = RacingScoringV3.points({
          position: Math.ceil(raceCompetitors / 2), competitors: raceCompetitors, eligible: participation.eligible, weight
        });
      } else {
        avgScore = Math.round(defaultPenaltyPos / 2) * weight;
      }
      sailResults[boatId].placements.push('RO');
      sailResults[boatId].racescore.push(avgScore);
    });
  });

  // 4. Net points and discards
  const discardCount = getDiscardCount_v3(raceCount, racingFormat.discardsRule);
  const scores = Object.values(sailResults);

  scores.forEach(sc => {
    const { gross, net, discardFlags } = calculateNetWithDiscards_v3(sc.racescore, discardCount, scoringSystem);
    sc.gross = gross;
    sc.net = net;
    sc.discards = discardFlags;
  });

  const updatedHandicaps = scores.map(r => ({
    member: r.member,
    sail: r.sail,
    boatId: r.boatId,
    hcap: r.hcap,
    adj: r.adj
  }));

  return { scores, updatedHandicaps, activeRaceSpecs, series: participation };
}