function getDiscardCount(raceCount) {
  if (raceCount < 4) return 0;
  if (raceCount < 8) return 1;
  return 2 + Math.floor((raceCount - 8) / 8);
}