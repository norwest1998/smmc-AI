/**
 * Function 1: renewMemberships
 * Scans the Members sheet and sets members "Active" and "Paid up" to FALSE
 * if current date > renewByDate + gracePeriod AND End Date < current date.
 */
function resetMemberships() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("Members");
  
  // 1. Fetch Variables from Named Ranges
  const renewByDate = new Date(ss.getRangeByName("renewByDate").getValue());
  const gracePeriodDays = Number(ss.getRangeByName("gracePeriod").getValue());
  
  // Calculate cutoff date = renewByDate + gracePeriod
  const cutoffDate = new Date(renewByDate);
  cutoffDate.setDate(cutoffDate.getDate() + gracePeriodDays);
  
  const runtimeDate = new Date(); // Current Date
  
  // Check if runtime date is beyond cutoff date
  if (runtimeDate <= cutoffDate) {
    Logger.log("Runtime date has not exceeded renewByDate + gracePeriod. No updates made.");
    return;
  }
}