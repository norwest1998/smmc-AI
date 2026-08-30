function runAutomatedLeaderboard(ss, shResults, boats) {
  var races = shResults.getRange("G3").getValue(); 
  const startRow = 6; 

  Logger.log("in leaderboard");
  
  // Extract columns including your margins
  const totalColumns = 6 + races; 
  const roundDetails = shResults.getRange(1, 1, 4, 7).getValues(); 
  const fullDataHeaders = shResults.getRange(5, 2, 1, totalColumns).getValues(); 
  const fullDataRows = shResults.getRange(startRow, 2, boats, totalColumns).getValues();

  // Calculate drops
  let numDrops = 0;
  if (races >= 4 && races < 8) {
    numDrops = 1;
  } else if (races >= 8 && races < 16) {
    numDrops = 2;
  } else if (races >= 16) {
    numDrops = Math.floor(races / 8) + 1;
  }

  const scoreMap = [];
  for (let i = 0; i < boats; i++) {
    const row = fullDataRows[i];
    const name = row[1]; // Column C
    const netTotal = row[5]; // Column G 
    
    const rawRaceSlice = row.slice(6, 6 + races);
    const rawScores = rawRaceSlice.map(Number).filter(s => !isNaN(s) && s > 0);

    if (!name || name.toString().trim() === "") continue;

    const sortedForDropping = [...rawScores].sort((a, b) => b - a);
    const excludedValues = sortedForDropping.slice(0, numDrops);

    let countingScores = [...rawScores];
    excludedValues.forEach(val => {
      const idx = countingScores.indexOf(val);
      if (idx > -1) countingScores.splice(idx, 1);
    });
    
    scoreMap.push({
      originalRowData: row, 
      membername: name,
      netScore: Number(netTotal), 
      allScores: rawScores,       
      countingScores: countingScores
    });
  }

  if (scoreMap.length === 0) return;

  // Sort by Appendix A8
  scoreMap.sort(compareCompetitors);

  // Apply sequential ranking numbers
  let currentRank = 1;
  scoreMap[0].rank = currentRank;
  scoreMap[0].originalRowData[0] = currentRank; 

  for (let i = 1; i < scoreMap.length; i++) {
    if (compareCompetitors(scoreMap[i - 1], scoreMap[i]) === 0) {
      scoreMap[i].rank = scoreMap[i - 1].rank;
    } else {
      scoreMap[i].rank = i + 1;
    }
    scoreMap[i].originalRowData[0] = scoreMap[i].rank; 
  }

  // Manage or update the destination Leaderboard sheet
  let shLeaderboard = ss.getSheetByName("Round Results");
  if (!shLeaderboard) {
    shLeaderboard = ss.insertSheet("Round Results");
  } else {
    shLeaderboard.clear(); 
  }

  // Output sorted table mapping
  shLeaderboard.getRange(1, 1, 4, 7).setValues(roundDetails);
  shLeaderboard.getRange(5, 2, 1, totalColumns).setValues(fullDataHeaders);
  const outputRows = scoreMap.map(item => item.originalRowData);
  shLeaderboard.getRange(startRow, 2, outputRows.length, totalColumns).setValues(outputRows);

  applyRoundCardFormatting(shLeaderboard);
  shResults.hideSheet(); 
}

// --- Tie Breaking Core Logic ---

function compareCompetitors(a, b) {
  if (a.netScore !== b.netScore) {
    return a.netScore - b.netScore;
  }
  const a81 = compareA81(a, b);
  if (a81 !== 0) return a81;

  const a82 = compareA82(a, b);
  if (a82 !== 0) return a82;

  return 0; 
}

function compareA81(a, b) {
  const aSorted = [...a.countingScores].sort((x, y) => x - y);
  const bSorted = [...b.countingScores].sort((x, y) => x - y);
  const maxLen = Math.min(aSorted.length, bSorted.length);
  for (let i = 0; i < maxLen; i++) {
    if (aSorted[i] !== bSorted[i]) {
      return aSorted[i] - bSorted[i];
    }
  }
  return 0;
}

function compareA82(a, b) {
  const len = Math.min(a.allScores.length, b.allScores.length);
  for (let i = len - 1; i >= 0; i--) {
    if (a.allScores[i] !== b.allScores[i]) {
      return a.allScores[i] - b.allScores[i];
    }
  }
  return 0;
}