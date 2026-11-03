/**
 * participationScoring_v3.js — participation weighting for a SERIES.
 * Uses RacingScoringV3.points():
 *   points = (competitors / eligible) x (eligible - position + 1) x spec weight
 *
 * Applies when the series format has WeightingFormat = participation AND Series.EntryRequired = TRUE.
 * Reads Series.EligibleStarters and Series.RegStatus fresh from the Series sheet on every run
 * (add those two columns to the Series sheet; Racing Management writes them).
 */
function getSeriesScoringConfig_v3(series) {
  const fmt = series && series.resolvedFormat;
  if (!fmt || !fmt.participationWeighting || !series.entryRequired) return null;   // otherwise normal scoring

  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.racingFormatsSpreadsheetId || RACING_FORMATS_SS_ID_V3);
  const row = rawRows_v3(ss, 'Series').find(r => String(col_v3(r, 'ID')).trim().toLowerCase() === series.id.toLowerCase());

  const eligible = Number(col_v3(row, 'EligibleStarters'));
  if (!(eligible > 0)) {
    throw new Error(`Series '${series.name}' uses participation weighting but Series.EligibleStarters is not set. ` +
                    `Use "Update field" or "Freeze field" in Racing Management first.`);
  }
  return { eligible, provisional: String(col_v3(row, 'RegStatus')).trim() !== 'Closed' };
}

/**
 * (competitors / eligible) x (eligible - position + 1) x spec weight   (high-point)
 *   competitors = finishers + DNS in that race (DNF / DSQ not counted); participation capped at 1;
 *   DNS / DNF / DSQ score 0.
 */
const RacingScoringV3 = (() => {
  const NON_SCORING = ['DNS', 'DNF', 'DSQ'];
  const norm = s => String(s == null ? '' : s).trim().toUpperCase();
  const round2 = n => Math.round(n * 100) / 100;

  function competitors(results) {
    return results.reduce((n, r) => {
      const s = norm(r.status);
      return n + ((s === 'DNS' || (!s && Number(r.position) > 0)) ? 1 : 0);
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