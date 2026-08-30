/**
* Scoring routines — low-point system with discards
*/
function buildScoresFromRaces(parsed, membersData, raceType) {

  /* ---------------------------
   * Create roster
   * --------------------------- */
  const classname = parsed.className;

  if (membersData.length === 0)
    throw new Error('No competitors for class: ' + classname);

  /* ---------------------------
   * Determine race count
   * --------------------------- */
  const raceCount = parsed.races.length;
  const raceData = parsed.races;

  /* ---------------------------
   * Determine who raced at least once
   * --------------------------- */
  const sailResults = {};

  // Get all unique sail numbers across all races
  const allSailNumbers = new Set();
  
  raceData.forEach(race => {
    // Add all finishers
    race.positions.forEach(sailNum => allSailNumbers.add(sailNum));
    
    // Add DNS entries
    if (race.dns) {
      const dnsSails = Array.isArray(race.dns) ? race.dns : [race.dns];
      dnsSails.forEach(sailNum => {
        if (sailNum !== "") allSailNumbers.add(sailNum);
      });
    }
    
    // Add DNF entries
    if (race.dnf) {
      const dnfSails = Array.isArray(race.dnf) ? race.dnf : [race.dnf];
      dnfSails.forEach(sailNum => {
        if (sailNum !== "") allSailNumbers.add(sailNum);
      });
    }
    
    // Add RO entries
    if (race.raceRO && race.raceRO !== "") {
      const roSails = Array.isArray(race.raceRO) ? race.raceRO : [race.raceRO];
      roSails.forEach(sailNum => {
        if (sailNum !== "") allSailNumbers.add(sailNum);
      });
    }
  });
  
  // Convert membersData array to object indexed by sailnumber (if it's an array)
  let membersLookup = {};
  if (membersData) {
    if (Array.isArray(membersData)) {
      membersData.forEach(m => {
        if (m.sailnumber) {
          membersLookup[m.sailnumber] = m;
        }
      });
    } else {
      membersLookup = membersData;
    }
  }
  
  // Initialize results for each sail number
  allSailNumbers.forEach(sailNum => {
    const member = membersLookup[sailNum];
    
    sailResults[sailNum] = {
      sail: sailNum,
      member: member ? member.membername : "",
      boatId: member ? member.boatId : "",
      hcap: member ? member.hcap : 0,
      adj: 0,
      placements: [],
      racescore: [],
      gross: 0
    };
  });

  // Retrieve Regatta configuration using regattaName (assumption-free)
  const regattaConfig = getRegattaConfigByName(parsed.regattaName);
  // Determine which column to use based on competitor count
  const adjustmentColumn = getAdjustmentColumn(parsed.competitorCount);


  // Process each race
  raceData.forEach((race, raceIdx) => {
    // Calculate the number of starters in this race (for DNS/DNF scoring)
    const dnsScore = parsed.competitorCount + 1;
    const dnfScore = dnsScore;
    
    // Track which sail numbers we've processed in this race
    const processedInRace = new Set();
    
    // Process finishers (positions)
    race.positions.forEach((sailNum, index) => {
      const position = index + 1;
      sailResults[sailNum].placements.push(position);
      sailResults[sailNum].racescore.push(position);
      processedInRace.add(sailNum);
    });
    
    // Process DNS
    if (race.dns) {
      const dnsSails = Array.isArray(race.dns) ? race.dns : [race.dns];
      dnsSails.forEach(sailNum => {
        if (sailNum !== "" && sailResults[sailNum]) {
          sailResults[sailNum].placements.push('DNS');
          sailResults[sailNum].racescore.push(dnsScore);
          processedInRace.add(sailNum);
        }
      });
    }
    
    // Process DNF
    if (race.dnf) {
      const dnfSails = Array.isArray(race.dnf) ? race.dnf : [race.dnf];
      dnfSails.forEach(sailNum => {
        if (sailNum !== "" && sailResults[sailNum]) {
          sailResults[sailNum].placements.push('DNF');
          sailResults[sailNum].racescore.push(dnfScore);
          processedInRace.add(sailNum);
        }
      });
    }
    
    // Process Race Officers (RO) - they get average points
    if (race.raceRO && race.raceRO !== "") {
      const roSails = Array.isArray(race.raceRO) ? race.raceRO : [race.raceRO];
      roSails.forEach(sailNum => {
        if (sailNum !== "" && sailResults[sailNum]) {
          // Calculate average score for this competitor
          // Average is calculated from their other races (excluding RO duties)
          const otherRaceScores = sailResults[sailNum].racescore.filter(score => 
            typeof score === 'number' && score > 0
          );
          
          let averageScore;
          if (otherRaceScores.length > 0) {
            const sum = otherRaceScores.reduce((acc, score) => acc + score, 0);
            averageScore = Math.round(sum / otherRaceScores.length);
          } else {
            // If no other races, use average of all finishers + 1
            averageScore = Math.round((parsed.competitorCount + 1) / 2) + 1;
          }
          
          sailResults[sailNum].placements.push('RO');
          sailResults[sailNum].racescore.push(averageScore);
          processedInRace.add(sailNum);
        }
      });
    }

    // Handicaps
    if (raceType === 'Handicap') {
      // Only loop over finishers
      race.positions.forEach((sailNum, index) => {
        const position = index + 1;
        if (parsed.regattaName == 'IOM Racing' && index < 3) {
          return;
        }     
 
        // Compute the handicap adjustment
        const adjustment = getHcapAdjustment({
          position,
          competitorCount: parsed.competitorCount,
          formula: regattaConfig['Hcap Formula'],
          adjustmentRow: regattaConfig[adjustmentColumn]
        });

        Logger.log(
          `Boat ${sailNum} Position ${position} Adjustment ${adjustment}`
        );

        // Update ADJUSTMENT
        sailResults[sailNum].adj = sailResults[sailNum].adj + adjustment;
      });
    }
    
  });
  
  // Calculate gross totals
  Object.keys(sailResults).forEach(sailNum => {
    const result = sailResults[sailNum].racescore;
    sailResults[sailNum].gross = result.reduce((sum, score) => sum + score, 0);
  });

  // Convert to array and sort by gross score
  const scores = Object.values(sailResults);
  scores.sort((a, b) => a.gross - b.gross);
  
  const updatedHandicaps = Object.values(sailResults).map(r => ({
    member: r.member,
    boatId: r.boatId,  
    hcap: r.hcap,
    adj: r.adj
  }));


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
  
  scores.sort((a, b) => a.net - b.net);

  return {
    scores,
    updatedHandicaps
  };
}

