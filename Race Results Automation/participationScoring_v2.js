/**
 * participationScoring_v2.js — NEW file for the v2 engine.
 *
 * Participation-weighted series scoring (high-point):
 *   points = (competitors / eligible) x (eligible - position + 1) x spec weight
 *   competitors = finishers + DNS in that race (DNF / DSQ are not counted)
 *   participation is capped at 1; DNS / DNF / DSQ score 0
 * The spec weight comes from the race's RaceSpec (already expanded by scoring_v2.js).
 */
const RacingScoring = (() => {
  const NON_SCORING = ["DNS", "DNF", "DSQ"];
  const norm = s => String(s == null ? "" : s).trim().toUpperCase();
  const round2 = n => Math.round(n * 100) / 100;

  function competitors(results) {
    return results.reduce((n, r) => {
      const s = norm(r.status);
      return n + ((s === "DNS" || (!s && Number(r.position) > 0)) ? 1 : 0);
    }, 0);
  }

  function points({ position, status, competitors: c, eligible, weight = 1 }) {
    const E = Number(eligible), C = Number(c), pos = Number(position);
    const w = isFinite(Number(weight)) ? Number(weight) : 1;
    if (!(E > 0) || !(pos > 0) || NON_SCORING.indexOf(norm(status)) > -1) return 0;
    return round2(Math.min(1, C / E) * Math.max(0, E - pos + 1) * w);
  }

  return { competitors, points };
})();

/**
 * Returns { eligible, provisional } when the regatta requires entry AND its resolved format has
 * participationWeighting = TRUE; otherwise null (normal scoring).
 * Reads the Regattas sheet fresh on every run (never from cache) so "Update field" / "Freeze field"
 * in Racing Management take effect immediately.
 */
function getSeriesScoringConfig_v2(regattaName, racingFormat) {
  if (!racingFormat || !racingFormat.participationWeighting) return null;

  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.masterDataSpreadsheetId);
  const sh = ss.getSheetByName('Regattas');
  if (!sh) return null;
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
  const key = String(regattaName || '').trim().toLowerCase();
  const row = v.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])))
                .find(r => String(r.ChampionshipName).trim().toLowerCase() === key);

  const isTrue = x => x === true || String(x).trim().toUpperCase() === 'TRUE';
  if (!row || !isTrue(row.EntryRequired)) return null;     // format flag on, but no series entry: normal high-point

  const eligible = Number(row.EligibleStarters);
  if (!(eligible > 0)) {
    throw new Error(`"${regattaName}" uses participation weighting but EligibleStarters is not set. ` +
                    `Use "Update field" or "Freeze field" in Racing Management first.`);
  }
  return { eligible, provisional: String(row.RegStatus).trim() !== 'Closed' };
}