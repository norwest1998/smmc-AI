/* parser.gs
 * Parse the regatta sheet (Position rows, Race columns) and transpose the data
 * into a structure where Sail Number is the primary key (Row) and the value
 * is an array of finishing positions (Columns = Races).
 */

function parseSimplifiedRegattaSheet(ss) {
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // Read all data
  const values = sheet.getRange(1, 1, lastRow || 10, lastCol || 5).getValues();

  // --- Header Parsing ---
  const regattaName = findLabelValue(values, 'Regatta Name') || findLabelValue(values, 'Regatta') || null;
  const className = findLabelValue(values, 'Class') || null;
  const dateRaw = findLabelValue(values, 'Date') || null;
  const date = tryNormalizeDate(dateRaw);
  const raceReport = sheet.getRange(5,5).getValue();

  // --- Find Table Header Row ---
  let tableHeaderRow = -1;
  for (let r = 0; r < values.length; r++) {
    const row = values[r].map(c => (c || '').toString().trim());
    if (row.some(cell => /position|r\d+|race/i.test(cell))) {
        tableHeaderRow = r;
        break;
    }
  }
  if (tableHeaderRow === -1) return null;

  const tableStart = tableHeaderRow + 1;

  // --- Parse race results ---
  const resultsBySailNumber = {};

  for (let r = tableStart; r < lastRow; r++) {
    const row = sheet.getRange(r + 1, 1, 1, lastCol).getValues()[0];
    const rowData = row.map(c => (c || '').toString().trim());
    const firstCol = rowData[0].toUpperCase();

    // Skip blank rows
    if (!firstCol) continue;

    // Identify position or special designation
    let position = parseInt(firstCol, 10);
    const isSpecial = ['DNS', 'DNF', 'DNC', 'RO'].includes(firstCol);
    if (isNaN(position) && !isSpecial) continue;

    // Iterate race columns
    for (let c = 1; c < rowData.length; c++) {
      const sailNumber = rowData[c];
      if (!sailNumber) continue;
      if (/R\d+/i.test(sailNumber)) continue; // skip header cells

      if (!resultsBySailNumber[sailNumber]) resultsBySailNumber[sailNumber] = [];
      const raceIndex = c - 1;

      // Pad array for missing races
      while (resultsBySailNumber[sailNumber].length < raceIndex) {
        resultsBySailNumber[sailNumber].push(null);
      }

      // Store numeric position or special designation
      resultsBySailNumber[sailNumber][raceIndex] = isSpecial ? firstCol : position;
    }
  }

  // --- Convert map to array ---
  const racesTransposed = Object.keys(resultsBySailNumber).map(sailNumber => ({
    sailNumber: sailNumber,
    positions: resultsBySailNumber[sailNumber]
  }));

  return {
    regattaName,
    className,
    date,
    races: racesTransposed,
    raceReport
  };
}


/**
 * Validates sail numbers against a master data list, using the new structure.
 */
function mapSailNumbersToMembers(parsed, masterData) {
  const classEntry = Object.values(masterData.classesById)
    .find(c => c.classname.toLowerCase() === (parsed.className || '').toLowerCase());
  if (!classEntry) throw new Error('Class not found: ' + parsed.className);
  const classname = classEntry.classname;

  // Build array of valid sail numbers as NUMBERS
  const validSailNumbers = new Set(
    (masterData.classMembersMap[classname] || [])
      .map(m => Number(m.sailnumber))
      .filter(n => !isNaN(n))
  );

  parsed.races.forEach(entry => {
    const raw = String(entry.sailNumber || '').trim();
    if (!raw) return;

    const match = raw.match(/\d+$/);
    if (!match) {
      Logger.log(`Warning: Cannot extract number from sail: ${raw}`);
      return;
    }

    const num = Number(match[0]);
    if (!validSailNumbers.has(num)) {
      Logger.log(`Warning: Sail number ${raw} (using ${num}) not found in class ${parsed.className}`);
    }
  });

   return parsed;
}



