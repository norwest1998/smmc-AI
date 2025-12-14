/**
 * Canonical DNC score for a race day
 */
function calculateDNCScore(competitorsCount) {
  return competitorsCount + 1;
}

function calculateDayDNC(competitors, races) {
  return (competitors + 1) * races;
}

function calculateSeriesAttendance(roundTotals, roundDNCs) {
  let attended = 0;

  for (let i = 0; i < roundTotals.length; i++) {
    const total = roundTotals[i];
    const dnc = roundDNCs[i];

    if (typeof total === 'number' &&
        typeof dnc === 'number' &&
        total < dnc) {
      attended++;
    }
  }

  return attended;
}

/******************************************************
 * Common helper: Calculate DNC value for Round.
 */
function calculateDncForRound(roundScoresByCompetitor) {
  // Count competitors who actually raced (numeric score)
  const competitors = roundScoresByCompetitor
    .filter(v => typeof v === 'number').length;

  return competitors > 0 ? competitors + 1 : '';
}


