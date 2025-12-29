/**
 * Completes the full recalculation of the Overall Results sheet.
 * Handles Attendance, Total (Net), and Discards.
 */
function recalculateOverall(bookID, eventID) {
  const ss = SpreadsheetApp.openById(bookID);
  const sh = ss.getSheetByName("Overall Results");

  const configData = getCurrentRoundInfo(eventID);
  const roundCount = configData.roundNumber; 
  if (roundCount <= 0) return;

  const discardNeeded = getDiscardCount(roundCount);

  const lastRow = sh.getLastRow();
  if (lastRow < 5) return;

  // Load Metadata and Scores
  const dncValues = sh.getRange(2, 7, 1, roundCount).getValues()[0];
  const scoreRange = sh.getRange(5, 7, lastRow - 4, roundCount).getValues();

  const finalCalculations = scoreRange.map(rowScores => {
    let attendanceCount = 0;
    let totalGross = 0;
    let validScores = [];

    rowScores.forEach((score, idx) => {
      if (typeof score === 'number') {
        const dncThreshold = dncValues[idx];
        if (score < dncThreshold) attendanceCount++;
        
        totalGross += score;
        validScores.push(score);
      }
    });

    const sortedScores = [...validScores].sort((a, b) => b - a);
    const discardSum = sortedScores.slice(0, discardNeeded).reduce((a, b) => a + b, 0);
    const netTotal = totalGross - discardSum;

    return {
      attendance: attendanceCount,
      net: netTotal,
      discard: discardSum
    };
  });

  // Write Attendance (Col A)
  const attendanceData = finalCalculations.map(res => [res.attendance]);
  sh.getRange(5, 1, attendanceData.length, 1).setValues(attendanceData);

  // Write Total (Col E) and Discard (Col F)
  const summaryData = finalCalculations.map(res => [res.net, res.discard]);
  sh.getRange(5, 5, summaryData.length, 2).setValues(summaryData);

  // Restore static header exactly as requested
  sh.getRange("F4").setValue("Discard");
  sh.getRange("B3").setValue("Rounds : " + roundCount);

  rankOverall(bookID, eventID)
}