/**
 * Returns the stored info for an eventID, or null if not processed yet
 */
function getCurrentRoundInfo(eventID) {
  const map = getProcessedRounds();
  return map[eventID] || null;
}

/**
 * Loads the processedRounds map from Script Properties
 */
function getProcessedRounds() {
  const props = PropertiesService.getScriptProperties();
  const stored = props.getProperty('processedRounds');
  return stored ? JSON.parse(stored) : {};
}

/**
 * Saves the processedRounds map back to Script Properties
 */
function saveProcessedRounds(map) {
  PropertiesService.getScriptProperties().setProperty('processedRounds', JSON.stringify(map));
}

/**
 * Adds or updates the metadata for an eventID
 */
function addOrUpdateProcessedRound({
  eventID,
  roundNumber,
  sheetID,
  raceDate,
  regattaName,
  className,
  competitorCount,
  note
}) {
  const map = getProcessedRounds();

  const wasExisting = map.hasOwnProperty(eventID);

  if (wasExisting) {
    const today = new Date().toISOString().split('T')[0];
    note = note ? `${note} | Re-processed ${today}` : `Re-processed ${today}`;
  }

  map[eventID] = {
    roundNumber,
    sheetID,
    processedDate: new Date().toISOString(),
    raceDate,
    regattaName,
    className,
    competitorCount,
    note
  };

  saveProcessedRounds(map);
}

function getNextRound() {
  const props = PropertiesService.getScriptProperties();
  let next = props.getProperty('nextRound');
  if (!next) {
    next = 1;
    props.setProperty('nextRound', next.toString());
  }
  return parseInt(next, 10);
}

function incrementNextRound() {
  const props = PropertiesService.getScriptProperties();
  const current = getNextRound();
  props.setProperty('nextRound', (current + 1).toString());
}

