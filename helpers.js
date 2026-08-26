function findMemberByClassAndSail(className, sail, classMembersMap) {
  if (!className || !sail) return null;

  // Use the cached version
  const classKey = className.toString().trim();

  const boats = classMembersMap[classKey];
  if (!boats || boats.length === 0) return null;

  const sailStr = sail.toString().trim();

  // Find the boat where the sail number matches the provided sail number string
  return boats.find(b =>
    b.sailnumber &&
    b.sailnumber.toString().trim() === sailStr
  ) || null;
}

/**
 * Finds the value corresponding to a label in a key:value sheet format.
 * Expects label in column A and value in column B.
 */
function findLabelValue(values, label) {
    // 1. Prepare the search label once, making it lowercase and clean.
    const searchLabel = (label || '').toLowerCase().trim();

    // Handle empty search label scenario
    if (searchLabel === '') {
        return null;
    }

    // 2. Iterate through each row in the 2D array 'values'.
    for (let r = 0; r < values.length; r++) {
        const row = values[r];
        
        // 3. Iterate through each cell (column) in the current row.
        // We stop one cell before the end because we need to return the value
        // *to the right* (at index c + 1).
        for (let c = 0; c < row.length - 1; c++) {
            
            // 4. Get the cell value, clean it (trim, remove colon, lowercase),
            // and ensure it's a string for comparison.
            const cellValue = (row[c] || '').toString().trim().replace(':', '').toLowerCase();
            
            // 5. Check if the cleaned cell value contains the search label.
            if (cellValue.includes(searchLabel)) {
                
                // 6. If found, return the value from the cell immediately to the right.
                // It's wrapped in a toString().trim() for consistency.
                return (row[c + 1] || '').toString().trim();
            }
        }
    }

    // 7. If the label is not found after checking all cells, return null.
    return null;
}

/**
 * Finds the number of discards allowed
 */
function getDiscardCount(length) {
    if (length < 4) return 0; // 1 discard after 4
    if (length < 8) return 1; // 2 discards after 8
    return 2 + Math.floor((length - 8) / 8); // 2 Discards after 8 + one more for every 8 thereafter
}

function lockSheetForAutomation(sheet) {
  if (!sheet) return;
  
  // Remove existing protections to prevent conflicts
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (let i = 0; i < protections.length; i++) {
    protections[i].remove();
  }

  const protection = sheet.protect().setDescription('Automation Locked');
  
  // Ensure only the person running the script (you) can edit
  const me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors());
  
  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}
