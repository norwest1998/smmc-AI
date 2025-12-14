function scoreRaceDay(results, competitors) {
  const scores = results.map(r => {
    if (typeof r === 'number') return r;
    if (r === 'DNS' || r === 'DNF') return competitors + 1;
    throw new Error('Invalid race result: ' + r);
  });

  const total = scores.reduce((a, b) => a + b, 0);

  const discardCount = getDiscardCount(scores.length);
  const sorted = [...scores].sort((a, b) => b - a);
  const discarded = sorted.slice(0, discardCount);
  const discard = discarded.reduce((a, b) => a + b, 0);

  return {
    scores,
    total,
    discard,
    net: total - discard,
    discardedIndexes: discarded.map(d => scores.indexOf(d))
  };
}

