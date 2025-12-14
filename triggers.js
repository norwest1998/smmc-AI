/* triggers.gs
 * Create the time-based trigger to run the orchestrator.
 */
function createRegattaTriggers() {
  // remove duplicates
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => { if (t.getHandlerFunction() === 'processNewRegattaSheets') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processNewRegattaSheets').timeBased().everyMinutes(5).create();
  Logger.log('Trigger created: processNewRegattaSheets every 5 minutes.');
}
