function parseHcapFormula(formula) {
  return formula.split(',').map(t => t.trim());
}

function getAdjustmentColumn(count) {
  if (count < 4) return '<4';
  if (count < 7) return '<7';
  if (count < 13) return '<13';
  return '13+';
}

function resolveFormulaToken(position, competitorCount, tokens) {
  const last = competitorCount;

  // 1. If it is the absolute last boat, always return 'L'
  if (position === last) return 'L';

  // 2. If the position is within our defined fixed tokens (1, 2, 3, 4, n)
  // and that token isn't the 'L' marker, use it.
  if (position <= tokens.length) {
    const token = tokens[position - 1];
    if (token !== 'L') return token;
  }
  // 3. Otherwise, check if we are "close" to the end (L-1, L-2)
  // Or default to 'n' (the last non-L token)
  const offset = last - position;
  const offsetToken = `L-${offset}`;
  
  // If L-1 exists in our formula, use it. 
  // If not, default to 'n' so middle boats aren't ignored.
  return tokens.includes(offsetToken) ? offsetToken : 'n';
}

function getHcapAdjustment({
  position,
  competitorCount,
  formula,
  adjustmentRow
  }) {
    const tokens = parseHcapFormula(formula);
    // Ensure we handle empty rows or bad data by defaulting to [0]
    const adjustments = adjustmentRow ? adjustmentRow.split(',').map(Number) : [0];
    
    // 1. Resolve the token
    let token = resolveFormulaToken(position, competitorCount, tokens);
    let index = tokens.indexOf(token);

    // 2. Robust Fallback
    if (index === -1) {
      if (position === competitorCount) {
        // If it's the last boat and 'L' is missing, try to find the last available adjustment
        index = tokens.length - 1;
      } else {
        // If it's a middle boat, try 'n'. If 'n' doesn't exist, default to the 5th token (index 4)
        let nIndex = tokens.indexOf('n');
        index = (nIndex !== -1) ? nIndex : Math.min(4, tokens.length - 1);
      }
    }

    Logger.log(
      JSON.stringify({
        position,
        competitorCount,
        formula,
        adjustmentRow
    })
    );

    Logger.log(
      JSON.stringify({
        token,
        index,
        result: adjustments[index]
      })
    );

  // 3. Final Safety Check: Ensure index is never -1 and within array bounds
  if (index < 0 || index >= adjustments.length) return 0;

  const result = adjustments[index];
  return isNaN(result) ? 0 : result;
}


/**
 * Finds the number of discards allowed
 */
function getDiscardCount(length) {
    if (length < 4) return 0; // 1 discard after 4
    if (length < 8) return 1; // 2 discards after 8
    return 2 + Math.floor((length - 8) / 8); // 2 Discards after 8 + one more for every 8 thereafter
}

function updateClassMemberHandicaps(updatedHandicaps, className) {
  const ss = SpreadsheetApp.openById(AUTOMATION_SHEET_ID);
  const sheet = ss.getSheetByName('ClassMembers');
  if (!sheet) throw new Error('ClassMembers sheet not found');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = name => headers.indexOf(name);

  const boatIdCol  = col('BoatID');
  const activeCol  = col('Active');
  const classCol   = col('Class');
  const hcapCol    = col('Handicap');
  const ghHcapCol  = col('GH HCap');

  if (boatIdCol === -1 || activeCol === -1 || classCol === -1)
    throw new Error('Required columns missing in ClassMembers');

  const targetCol = className === 'General' ? ghHcapCol : hcapCol;
  if (targetCol === -1) throw new Error('Target handicap column not found');

  const hcapMap = {};
  updatedHandicaps.forEach(r => {
    if (!r.boatId) return;                  
    if (r.adj === 0) return;                
    hcapMap[String(r.boatId)] = Math.max(0, r.hcap + r.adj);
  });

  // Create an array specifically for the target handicap column
  // It matches the exact height of our rows (excluding header row index 0)
  const handicapColumnValues = [];
  let updates = 0;

  for (let i = 1; i < data.length; i++) {
    // Default to keeping the existing value in the spreadsheet
    let finalValue = data[i][targetCol]; 

    // Check if the boat meets the update criteria
    if (data[i][activeCol] === true && data[i][classCol] === className) {
      const boatId = String(data[i][boatIdCol]);
      if (boatId in hcapMap) {
        finalValue = hcapMap[boatId];
        updates++;
      }
    }
    
    // Push into our single-column update array
    handicapColumnValues.push([finalValue]);
  }

  // Only write to the target column range, leaving the 'Active' checkbox column completely untouched
  if (updates > 0) {
    // Row start: 2 (to skip headers), Column start: targetCol + 1 (1-indexed)
    sheet.getRange(2, targetCol + 1, handicapColumnValues.length, 1).setValues(handicapColumnValues);
    Logger.log(`Handicaps updated for ${updates} boat(s) in class: ${className}`);
  } else {
    Logger.log(`No handicap updates needed for class: ${className}`);
  }

  return updates;
}

function snapshotClassMembers_(sheet) {
  const ts = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );

  const ss = sheet.getParent();
  const snap = ss.insertSheet(`ClassMembers SNAP ${ts}`);
  snap.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
      .setValues(sheet.getDataRange().getValues());
}

function getRegattaConfigByName(regattaName) {
  const ss = SpreadsheetApp.openById(AUTOMATION_SHEET_ID);
  const sheet = ss.getSheetByName('Regattas');
  if (!sheet) throw new Error('Regattas sheet not found');

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const col = name => headers.indexOf(name);

  const nameCol     = col('ChampionshipName');
  const formulaCol  = col('Hcap Formula');
  const lt4Col      = col('<4');
  const lt7Col      = col('<7');
  const lt13Col     = col('<13');
  const gte13Col    = col('13+');

  if (
    nameCol === -1 ||
    formulaCol === -1 ||
    lt4Col === -1 ||
    lt7Col === -1 ||
    lt13Col === -1 ||
    gte13Col === -1
  ) {
    throw new Error('One or more required columns missing in Regattas sheet');
  }

  for (let i = 1; i < data.length; i++) {
    if (data[i][nameCol] === regattaName) {
      return {
        'Hcap Formula': data[i][formulaCol],
        '<4':  data[i][lt4Col],
        '<7':  data[i][lt7Col],
        '<13': data[i][lt13Col],
        '13+': data[i][gte13Col]
      };
    }
  }

  throw new Error(`Regatta configuration not found for ${regattaName}`);
}
