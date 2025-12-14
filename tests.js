// Tests for major functions
function runAllTests() {
  test_getDiscardCount();
  test_scoreRaceDay_basic();
  test_scoreRaceDay_dns_dnf();
  test_scoreRaceDay_multiple_discards();
  test_seriesAttendance();
  test_seriesNetScoring();

  Logger.log('✅ ALL TESTS PASSED');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `ASSERT FAIL: ${message}\nExpected: ${expected}\nActual: ${actual}`
    );
  }
}

function assertArrayEqual(actual, expected, message) {
  if (actual.length !== expected.length) {
    throw new Error(`ASSERT FAIL: ${message} (length mismatch)`);
  }
  actual.forEach((v,i) => {
    if (v !== expected[i]) {
      throw new Error(
        `ASSERT FAIL: ${message}\nIndex ${i}: expected ${expected[i]}, got ${v}`
      );
    }
  });
}

function test_getDiscardCount() {
  assertEqual(getDiscardCount(0), 0, '0 races');
  assertEqual(getDiscardCount(3), 0, '3 races');
  assertEqual(getDiscardCount(4), 1, '4 races');
  assertEqual(getDiscardCount(7), 1, '7 races');
  assertEqual(getDiscardCount(8), 2, '8 races');
  assertEqual(getDiscardCount(15), 2, '15 races');
  assertEqual(getDiscardCount(16), 3, '16 races');
}

function test_scoreRaceDay_basic() {
  const r = scoreRaceDay([1,2,3,4]);
  assertEqual(r.total, 10, 'total');
  assertEqual(r.discard, 4, 'discard');
  assertEqual(r.net, 6, 'net');
}

function test_scoreRaceDay_dns_dnf() {
  const competitors = 5;
  const r = scoreRaceDay(
    [1, 'DNF', 2, 'DNS', 3],
    competitors
  );

  // Scores become: [1, 6, 2, 6, 3]
  assertEqual(r.total, 18, 'total includes DNS/DNF');
  assertEqual(r.discard, 0, 'no discard under 4 races');
  assertEqual(r.net, 18, 'net');
}

function test_scoreRaceDay_multiple_discards() {
  const competitors = 7;
  const r = scoreRaceDay([2,5,1,4,3,6,7,'DNF'],competitors);
  assertEqual(r.discard, 15, 'discard 8 + 7');
  assertEqual(r.net, 21, 'net');
}

function calculateSeriesAttendance(netScores, dncScores) {
  let attended = 0;
  netScores.forEach((v,i) => {
    if (typeof v === 'number' && v < dncScores[i]) attended++;
  });
  return attended;
}

function test_seriesAttendance() {
  const nets = [12, 24, 99, 18];
  const dncs = [100, 24, 100, 20];
  assertEqual(
    calculateSeriesAttendance(nets, dncs),
    3,
    'attendance < DNC'
  );
}

function calculateSeriesTotalsFromNet(nets) {
  const numeric = nets.filter(v => typeof v === 'number');
  const discardCount = getDiscardCount(numeric.length);
  const sorted = [...numeric].sort((a,b) => b - a);

  const discard = sorted.slice(0, discardCount)
    .reduce((a,b)=>a+b,0);
  const total = numeric.reduce((a,b)=>a+b,0);

  return { total, discard, net: total - discard };
}

function test_seriesNetScoring() {
  const r = calculateSeriesTotalsFromNet([10,15,8,20]);
  assertEqual(r.discard, 20, 'discard highest');
  assertEqual(r.net, 33, 'net');
}

