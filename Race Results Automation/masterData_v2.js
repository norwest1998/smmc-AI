/**
 * Global cache for v2 master data during single execution instance.
 */
let MASTER_DATA_V2_CACHE = null;

const SHEET_RACINGFORMATS = 'RacingFormats';
const SHEET_RACESPECS = 'RaceSpecs';

function getMasterData_v2() {
  if (MASTER_DATA_V2_CACHE !== null) {
    return MASTER_DATA_V2_CACHE;
  }

  const cache = CacheService.getScriptCache();
  const cachedData = cache.get('MASTER_DATA_V2_FULL_P1');

  if (cachedData) {
    try {
      MASTER_DATA_V2_CACHE = JSON.parse(cachedData);
      Logger.log("Loaded Master Data v2 from CacheService.");
      return MASTER_DATA_V2_CACHE;
    } catch (e) {
      Logger.log("Master Data v2 cache parsing error: " + e.message);
    }
  }

  Logger.log("Cache miss. Loading Master Data v2 from Google Sheets...");
  MASTER_DATA_V2_CACHE = loadMasterData_v2();

  try {
    cache.put('MASTER_DATA_V2_FULL_P1', JSON.stringify(MASTER_DATA_V2_CACHE), 900);
  } catch (e) {
    Logger.log("Failed to cache Master Data v2: " + e.message);
  }

  return MASTER_DATA_V2_CACHE;
}

function loadMasterData_v2() {
  const cfg = getConfig();
  const id = cfg.masterDataSpreadsheetId;
  if (!id) throw new Error('MASTER DATA spreadsheet id not set.');
  const ss = SpreadsheetApp.openById(id);

  // 1. Load Base Legacy-Compatible Entities
  const members = sheetToObjects(ss, SHEET_MEMBERS, ['memberId', 'active', 'membername']);
  const classes = sheetToObjects(ss, SHEET_CLASSES, ['classId', 'classname']);
  const allClassMembersRows = sheetToObjects(
    ss,
    SHEET_CLASSMEMBERS,
    ['boatId', 'active', 'membername', 'classname', 'sailnumber', 'model', 'handicap', 'hrn', 'gh', 'ghcap']
  );

  const regattas = sheetToObjects(
    ss,
    SHEET_REGATTAS,
    ['regattaId', 'regattaname', 'classname', 'type', 'formatId', 'weekofmonth', 'time', 'hcap formula', '<4', '<7', '<13', '13+']
  );

  // 2. Load v2 Entities
  const racingFormatsRaw = sheetToObjects(
    ss,
    SHEET_RACINGFORMATS,
    ['formatId', 'name', 'description', 'scoringSystem', 'discardsRule', 'allowedClassIds']
  );

  const raceSpecsRaw = sheetToObjects(
    ss,
    SHEET_RACESPECS,
    ['specId', 'formatId', 'sequence', 'raceType', 'count', 'weight', 'configJson']
  );

  // Columns added for series entry / participation weighting. Read raw so they never depend on sheetToObjects.
  const specExtra = {};
  rawRows_v2(ss, SHEET_RACESPECS).forEach(r => { specExtra[String(r.specId).trim()] = r; });
  const fmtExtra = {};
  rawRows_v2(ss, SHEET_RACINGFORMATS).forEach(r => { fmtExtra[String(r.formatId).trim()] = r; });

  // 3. Process Members & Classes
  const membersById = {};
  members.forEach(m => { if (m.memberId) membersById[m.memberId] = m; });

  const classesById = {};
  classes.forEach(c => { if (c.classId) classesById[c.classId] = c; });

  const classMembersMap = {};
  allClassMembersRows.filter(r => r.active).forEach(r => {
    if (!classMembersMap[r.classname]) classMembersMap[r.classname] = [];
    classMembersMap[r.classname].push({
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId,
      hcap: r.handicap
    });
  });

  allClassMembersRows.filter(r => r.gh).forEach(r => {
    if (!classMembersMap["General"]) classMembersMap["General"] = [];
    classMembersMap["General"].push({
      membername: r.membername,
      sailnumber: r.sailnumber,
      boatId: r.boatId,
      hcap: r.ghcap
    });
  });

  // 4. Index RaceSpecs by formatId
  const raceSpecsByFormat = {};
  raceSpecsRaw.forEach(spec => {
    const ex = specExtra[String(spec.specId).trim()];
    if (ex && String(ex.active).trim().toUpperCase() === 'FALSE') return;   // removed in Racing Management
    const fId = String(spec.formatId || '').trim();
    if (!raceSpecsByFormat[fId]) raceSpecsByFormat[fId] = [];
    
    let parsedConfig = {};
    if (spec.configJson) {
      try {
        parsedConfig = typeof spec.configJson === 'string' ? JSON.parse(spec.configJson) : spec.configJson;
      } catch (err) {
        Logger.log(`Warning: Failed to parse configJson for specId ${spec.specId}: ${err.message}`);
      }
    }

    raceSpecsByFormat[fId].push({
      specId: spec.specId,
      formatId: fId,
      sequence: Number(spec.sequence) || 1,
      raceType: String(spec.raceType || 'scratch').trim().toLowerCase(),
      count: Number(spec.count) || 1,
      weight: spec.weight !== null && spec.weight !== '' ? Number(spec.weight) : 1.0,
      config: parsedConfig
    });
  });

  // Sort specs within each format by sequence
  Object.keys(raceSpecsByFormat).forEach(fId => {
    raceSpecsByFormat[fId].sort((a, b) => a.sequence - b.sequence);
  });

  // 5. Index RacingFormats
  const formatsById = {};
  racingFormatsRaw.forEach(fmt => {
    const fId = String(fmt.formatId || '').trim();
    const participation = isTrueV2_(((fmtExtra[fId] || {}).participationWeighting));
    formatsById[fId] = {
      formatId: fId,
      name: fmt.name,
      description: fmt.description,
      participationWeighting: participation,
      // participation weighting is always high-point
      scoringSystem: participation ? 'highpoint' : normScoring_v2(fmt.scoringSystem),
      discardsRule: String(fmt.discardsRule || '4, 8, 16, 24').trim(),
      allowedClassIds: fmt.allowedClassIds ? String(fmt.allowedClassIds).split(',').map(s => s.trim()) : [],
      raceSpecs: raceSpecsByFormat[fId] || []
    };
  });

  // 6. Index Regattas with Automatic Fallback / Synthetic Formats
  const regattasByName = {};
  regattas.forEach(r => {
    const key = (r.regattaname || '').toString().trim().toLowerCase();
    const explicitFormatId = String(r.formatId || '').trim();

    let resolvedFormat = formatsById[explicitFormatId];

    // Fallback: Synthesize format from legacy regatta values if missing or unlinked
    if (!resolvedFormat) {
      const isHandicap = (r.type || '').toString().trim().toLowerCase() === 'handicap';
      const syntheticFormatId = `SYNTHETIC_${r.regattaId || key}`;
      
      resolvedFormat = {
        formatId: syntheticFormatId,
        name: `${r.regattaname} (Auto Synthetic)`,
        description: 'Auto-generated fallback from legacy regatta setup',
        scoringSystem: 'lowpoint',
        participationWeighting: false,
        discardsRule: '4, 8, 16, 24', // Standard RRS fallback
        allowedClassIds: [],
        raceSpecs: [
          {
            specId: `SPEC_${syntheticFormatId}_1`,
            formatId: syntheticFormatId,
            sequence: 1,
            raceType: isHandicap ? 'handicap' : 'scratch',
            count: 99, // Covers standard rounds
            weight: 1.0,
            config: {
              formula: r['hcap formula'] || '1, 2, 3, 4, n, L-2, L-1, L',
              brackets: {
                '<4': r['<4'] || '0',
                '<7': r['<7'] || '0',
                '<13': r['<13'] || '0',
                '13+': r['13+'] || '0'
              }
            }
          }
        ]
      };
    }

    regattasByName[key] = {
      ...r,
      resolvedFormat
    };
  });

  return {
    members,
    membersById,
    classes,
    classesById,
    classMembersMap,
    racingFormats: formatsById,
    raceSpecs: raceSpecsByFormat,
    regattas,
    regattasByName
  };
}

const isTrueV2_ = v => v === true || String(v).trim().toUpperCase() === 'TRUE';

/** Reads a sheet into objects keyed by trimmed header (raw, no column mapping). */
function rawRows_v2(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0].map(x => String(x).trim());
  return v.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}