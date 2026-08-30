function addNewBoat(boatData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = new Date();
  const hexCode = boatData.hexCode;
  const memberEmail = getEmailFromTrackingCode(hexCode);
  
  if (!memberEmail) return { status: "Error", message: "Invalid or expired link" };

  // Fetch Member details
  const data = getMemberAndBoatData(memberEmail);
  const memberName = data.member["MemberName"];
  
  if (!memberName) return { status: "Error", message: "Member record not found" };

  const classSheet = ss.getSheetByName("ClassMembers");
  const cData = classSheet.getDataRange().getValues();
  const cHeaders = cData[0];

  // Auto-generate next numeric BoatID internally
  const boatIdIdx = cHeaders.indexOf("BoatID");
  let maxBoatId = 0;
  if (boatIdIdx !== -1) {
    for (let i = 1; i < cData.length; i++) {
      let val = parseInt(cData[i][boatIdIdx]);
      if (!isNaN(val) && val > maxBoatId) {
        maxBoatId = val;
      }
    }
  }
  const newBoatId = maxBoatId + 1;

  // Build new row matching ClassMembers sheet column order
  let newRow = new Array(cHeaders.length).fill("");
  
  if (cHeaders.indexOf("BoatID") !== -1) newRow[cHeaders.indexOf("BoatID")] = newBoatId;
  if (cHeaders.indexOf("Member") !== -1) newRow[cHeaders.indexOf("Member")] = memberName;
  if (cHeaders.indexOf("Class") !== -1) newRow[cHeaders.indexOf("Class")] = boatData.new_Class || "";
  if (cHeaders.indexOf("SailNo") !== -1) newRow[cHeaders.indexOf("SailNo")] = boatData.new_SailNo || "";
  if (cHeaders.indexOf("Model") !== -1) newRow[cHeaders.indexOf("Model")] = boatData.new_Model || "";
  if (cHeaders.indexOf("HRN") !== -1) newRow[cHeaders.indexOf("HRN")] = boatData.new_HRN || "";
  if (cHeaders.indexOf("GH") !== -1) newRow[cHeaders.indexOf("GH")] = (boatData.new_GH === "true" || boatData.new_GH === true);
  if (cHeaders.indexOf("Active") !== -1) newRow[cHeaders.indexOf("Active")] = true;

  // Append new row to ClassMembers
  classSheet.appendRow(newRow);

  // Log to Audit Log
  const auditLogSheet = ss.getSheetByName("AuditLog");
  if (auditLogSheet) {
    auditLogSheet.appendRow([
      hexCode, 
      timestamp, 
      memberName, 
      "Boat.Added", 
      "", 
      `ID:${newBoatId}, Class:${boatData.new_Class}, SailNo:${boatData.new_SailNo}`
    ]);
  }

  // Fetch updated boats list and available classes
  const updatedData = getMemberAndBoatData(memberEmail);
  const classList = getClasses();

  return { status: "Success", boats: updatedData.boats, classes: classList };
}