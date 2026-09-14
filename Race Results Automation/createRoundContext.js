/**
 * Lightweight state object for a single regatta-processing run.
 * Accumulates context as the pipeline progresses so a single
 * consolidated log entry (success or failure) shows exactly how
 * far processing got and what was created.
 */
function createRoundContext(parsed, raceType) {
  return {
    parsed,
    raceType,
    startedAt: new Date(),
    overallSheetID: null,
    scores: null,
    updatedHandicaps: null,
    roundResult: null,
    created: {},        // tracks side effects that may need rollback
    steps: [],           // ordered log trail
    status: 'running',

    set(key, value) {
      this[key] = value;
      this.steps.push(`${key} set`);
    },

    markCreated(key, info) {
      this.created[key] = info;
      this.steps.push(`created:${key} -> ${JSON.stringify(info)}`);
    },

    log(msg) {
      this.steps.push(msg);
      console.log(msg);
    },

    succeed() {
      this.status = 'success';
      this.emit();
    },

    fail(err) {
      this.status = 'failed';
      this.error = err && err.message ? err.message : String(err);
      this.emit();
    },

    emit() {
      console.log(JSON.stringify({
        status: this.status,
        eventID: this.parsed && this.parsed.eventID,
        regattaName: this.parsed && this.parsed.regattaName,
        raceType: this.raceType,
        overallSheetID: this.overallSheetID,
        round: this.roundResult && this.roundResult.roundNumber,
        error: this.error || null,
        durationMs: new Date() - this.startedAt,
        steps: this.steps
      }));
    }
  };
}