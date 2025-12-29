/**
* Parse an uploaded Race Results sheet and return structured object
* Expected layout (example provided by user): header rows with Regatta Name, Class, Date
* followed by a table where first column is Position and subsequent columns are R1..Rn.
*/
function parseSimplifiedRegattaSheet(ss) {
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // Read all data
  const values = sheet.getRange(1, 1, lastRow || 10, lastCol || 5).getValues();

  // --- Header Parsing ---
  const eventID = sheet.getRange(1,1).getValue();
  const regattaName = findLabelValue(values, 'Regatta Name') || findLabelValue(values, 'Regatta') || null;
  var dateRaw = findLabelValue(values, 'Date') || null;
  const className = findLabelValue(values, 'Class') || null;
  const competitorCount = findLabelValue(values, 'Boat Count');
  
  let raceReport = findLabelValue(values, 'Race Report');
  if(!raceReport) {
    var raceReportDate = formatDate(dateRaw);
    raceReport = `Race results for ${regattaName} sailed on the ${raceReportDate}`;
  }

  // Sort the date out here so it doesnt need to be manipulated down teh line...
  if(!(dateRaw instanceof Date) || isNaN(dateRaw)) { 
    dateRaw = new Date(dateRaw); 
  } 
  if (isNaN(dateRaw)) { 
    throw new Error("Invalid date"); 
  }
  var date = dateRaw;
  
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
    eventID,
    regattaName,
    className,
    date,
    competitorCount,
    raceReport,
    races: racesTransposed
  };
}