function cleanupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'checkAndProcessJson') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

// Deletes any active triggers for a specific function name
function deleteTriggersForFunction(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

// 1. Create trigger for a specific Date object (Event End Time)
function createAtTimeTrigger(targetDate, functionToRun = 'checkAndProcessJson') {
  deleteTriggersForFunction(functionToRun);
  
  ScriptApp.newTrigger(functionToRun)
    .timeBased()
    .at(targetDate)
    .create();
}

// 2. Create one-off trigger for X minutes in the future
function createDelayTrigger(minutes, functionToRun = 'checkAndProcessJson') {
  deleteTriggersForFunction(functionToRun);
  
  ScriptApp.newTrigger(functionToRun)
    .timeBased()
    .after(minutes * 60 * 1000) // Convert minutes to milliseconds
    .create();
}

/**
 * Schedules a trigger for the next upcoming event.
 */
function scheduleNextEventTrigger() {
  const nextEvent = getNextUnprocessedEvent();

  if (!nextEvent) {
    Logger.log('No upcoming events found. Pipeline is idle.');
    return;
  }

  const now = new Date();

  if (nextEvent.endTime > now) {
    Logger.log(`Setting trigger for "${nextEvent.eventName}" at ${nextEvent.endTime}`);
    createAtTimeTrigger(nextEvent.endTime, 'checkAndProcessJson');
  } else {
    Logger.log(`End time passed for "${nextEvent.eventName}". Checking folder in 5 minutes.`);
    createDelayTrigger(5, 'checkAndProcessJson');
  }
}