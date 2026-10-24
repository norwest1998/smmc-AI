/**
 * Test Harness: Compares Legacy v1 calculation results against v2 calculation results
 * without modifying any sheets, files, or external calendars.
 */
function runParallelComparison(sampleJsonPayload) {
  console.log("=================================================");
  console.log(" STARTING SIDE-BY-SIDE VERIFICATION TEST (v1 vs v2) ");
  console.log("=================================================\n");

  const parsed = typeof sampleJsonPayload === 'string' ? JSON.parse(sampleJsonPayload) : sampleJsonPayload;

  // 1. Run Legacy Calculations (Inspection Mode)
  const legacyMD = getMasterData();
  const classDataLegacy = legacyMD.classMembersMap[parsed.className] || [];
  const legacyBuild = buildScoresFromRaces(parsed, classDataLegacy, 'Handicap');
  const legacyRanked = rankScoresMap(legacyBuild.scores);

  // 2. Run v2 Calculations (Dry Run)
  const v2Result = processNewRegattaSheets_v2(parsed, parsed.regattaName, null, true);
  const v2Ranked = v2Result.rankedScores;

  // 3. Compare Results
  const discrepancies = [];
  const compTable = [];

  const legacyMap = {};
  legacyRanked.forEach(r => { legacyMap[r.sail] = r; });

  const v2Map = {};
  v2Ranked.forEach(r => { v2Map[r.sail] = r; });

  const allSails = Array.from(new Set([...Object.keys(legacyMap), ...Object.keys(v2Map)]));

  allSails.forEach(sail => {
    const leg = legacyMap[sail] || { member: 'N/A', rank: -1, net: -1, gross: -1, adj: 0 };
    const v2 = v2Map[sail] || { member: 'N/A', rank: -1, net: -1, gross: -1, adj: 0 };

    const rankDiff = leg.rank !== v2.rank;
    const netDiff = leg.net !== v2.net;
    const dropDiff = (leg.gross - leg.net) !== (v2.gross - v2.net);
    const adjDiff = leg.adj !== v2.adj;

    if (rankDiff || netDiff || dropDiff || adjDiff) {
      discrepancies.push({
        sail,
        member: v2.member || leg.member,
        v1: { rank: leg.rank, net: leg.net, drop: leg.gross - leg.net, adj: leg.adj },
        v2: { rank: v2.rank, net: v2.net, drop: v2.gross - v2.net, adj: v2.adj },
        diffs: { rankDiff, netDiff, dropDiff, adjDiff }
      });
    }

    compTable.push({
      "Sail": sail,
      "Name": v2.member,
      "v1 Rank": leg.rank,
      "v2 Rank": v2.rank,
      "v1 Net": leg.net,
      "v2 Net": v2.net,
      "v1 Drop": leg.gross - leg.net,
      "v2 Drop": v2.gross - v2.net,
      "v1 Adj": leg.adj,
      "v2 Adj": v2.adj
    });
  });

  console.table(compTable);

  if (discrepancies.length === 0) {
    console.log("PASS: 100% Match! Legacy and v2 systems produced identical results.");
  } else {
    console.warn(`WARNING: Discrepancies detected for ${discrepancies.length} competitor(s):`);
    discrepancies.forEach(d => {
      console.log(`- Sail #${d.sail} (${d.member}):`);
      if (d.diffs.rankDiff) console.log(`   Rank -> v1: ${d.v1.rank} | v2: ${d.v2.rank}`);
      if (d.diffs.netDiff) console.log(`   Net  -> v1: ${d.v1.net}  | v2: ${d.v2.net}`);
      if (d.diffs.dropDiff) console.log(`   Drop -> v1: ${d.v1.drop} | v2: ${d.v2.drop}`);
      if (d.diffs.adjDiff) console.log(`   Adj  -> v1: ${d.v1.adj}  | v2: ${d.v2.adj}`);
    });
  }

  return {
    passed: discrepancies.length === 0,
    discrepancyCount: discrepancies.length,
    discrepancies
  };
}

function testOctober10Parallel() {
  const samplePayload = {
    "eventID": "02C75C89",
    "regattaDate": "10/10/2026",
    "regattaName": "General Handicap",
    "className": "General",
    "competitorCount": 7,
    "raceReport": "Test run",
    "races": [
      { "raceNumber": 1, "positions": [813, 584, 428, 866, 690, 93, 382] },
      { "raceNumber": 2, "positions": [866, 382, 428, 584, 690, 813], "dns": [93] },
      { "raceNumber": 3, "positions": [866, 584, 382, 428, 690, 813], "dns": [93] },
      { "raceNumber": 4, "positions": [428, 866, 813, 382, 690, 584], "dns": [93] },
      { "raceNumber": 5, "positions": [690, 382, 584, 866, 813], "dns": [428, 93] },
      { "raceNumber": 6, "positions": [382, 690, 866, 428, 584], "dns": [813, 93] },
      { "raceNumber": 7, "positions": [866, 428, 382, 690], "dns": [584, 813, 93] }
    ]
  };

  runParallelComparison(samplePayload);
}