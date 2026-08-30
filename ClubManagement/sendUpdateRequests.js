// --- 1. SEND EMAILS & TRACK ---
function sendUpdateEmails() {
  sendUpdateRequests(false);
}

function sendRenewEmails(){
  sendUpdateRequests(true)
}


function sendUpdateRequests(renew) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("Members");
  const trackingSheet = ss.getSheetByName("Tracking");
  
  const memberData = memberSheet.getDataRange().getValues();
  const headers = memberData[0];
  
  const idxActive = headers.indexOf("Active");
  const idxName   = headers.indexOf("MemberName");
  const idxEmail  = headers.indexOf("email");
  const idxType   = headers.indexOf("Membership");

  const annualFee = ss.getRangeByName("annualFee").getValue();
  const nswryaFee = ss.getRangeByName("nswryaFee").getValue();
  
  const timestamp = new Date();
  
  for (let i = 1; i < memberData.length; i++) {
    const row = memberData[i];
    
    if (row[idxActive] === true || row[idxActive] === "Yes" || row[idxActive] === "Active") {
      const memberName = row[idxName];
      const memberEmail = row[idxEmail];
      const membership = row[idxType];
      
      if (!memberEmail) continue;
      
      const hexCode = generateHexCode();
      const personalLink = `${WEB_APP_URL}?id=${hexCode}`;

      const membershipFee = membership ? "Full"| annualFee + nswryaFee : annualFee;

      let renewmsg = `It's membership renewal time again, please pay the annual membership fees of $${membershipFee} into the bank account:\n
        Bank: ANZ\n
        BSB: 012-228\n
        A/c No: 2236-53527\n\n`;
      if(!renew) renewmsg = null;
      
      const subject = "SMMC Member Information - Please Update Your Details";
      const body = 
        "Dear " + memberName + ",\n\n" + renewmsg +

        "Please review and update your personal and boat details by clicking the link below:\n\n" +
        personalLink +
        "\n\nThank you,\nSMMC Management";
     
      try {
        MailApp.sendEmail(memberEmail, subject, body);
        trackingSheet.appendRow([hexCode, timestamp, memberName, memberEmail, "Sent", "", timestamp]);
      } catch (e) {
        Logger.log(`Failed to send to ${memberEmail}: ${e.message}`);
      }
    }
  }
}


// Lookup email by hex code
function getEmailFromTrackingCode(code) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Tracking");
  if (!sheet) return null;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(code).trim()) {
      return data[i][3]; // Column D: Member email
    }
  }
  return null;
}



// --- 3. PROCESS FORM SUBMISSION ---
function processForm(formData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = new Date();
  const hexCode = formData.hexCode;
  const memberEmail = getEmailFromTrackingCode(hexCode);
  
  if (!memberEmail) return "Error: Session Expired";
  
  // 1. Update Members Sheet & Audit Log
  const memberSheet = ss.getSheetByName("Members");
  const mData = memberSheet.getDataRange().getValues();
  const mHeaders = mData[0];
  let mRowIndex = -1;
  
  for (let i = 1; i < mData.length; i++) {
    if (String(mData[i][mHeaders.indexOf("email")]).toLowerCase().trim() === String(memberEmail).toLowerCase().trim()) {
      mRowIndex = i + 1;
      break;
    }
  }
  
  const memberFieldsToUpdate = ["MemberName", "Phone", "email", "Address Line", "Suburb", "PCode", "Emergency Contact Name", "Emergency Contact Number", "WhatsApp"];
  const auditLogSheet = ss.getSheetByName("AuditLog");
  const memberName = mData[mRowIndex-1][mHeaders.indexOf("MemberName")];
  
  if (mRowIndex !== -1) {
    memberFieldsToUpdate.forEach(field => {
      const colIdx = mHeaders.indexOf(field) + 1;
      if (colIdx > 0) {
        const oldValue = memberSheet.getRange(mRowIndex, colIdx).getValue();
        const newValue = formData["m_" + field];
        
        if (String(oldValue) !== String(newValue)) {
          memberSheet.getRange(mRowIndex, colIdx).setValue(newValue);
          if (auditLogSheet) {
            auditLogSheet.appendRow([hexCode, timestamp, memberName, `Member.${field}`, oldValue, newValue]);
          }
        }
      }
    });
  }
  
  // 2. Update ClassMembers Sheet & Audit Log
  const classSheet = ss.getSheetByName("ClassMembers");
  const cHeaders = classSheet.getDataRange().getValues()[0];
  const boatFieldsToUpdate = ["Class", "SailNo", "Model", "HRN", "GH", "Active"];
  
  let index = 0;
  while (formData[`b_row_${index}`]) {
    const rNum = parseInt(formData[`b_row_${index}`]);
    boatFieldsToUpdate.forEach(field => {
      const colIdx = cHeaders.indexOf(field) + 1;
      if (colIdx > 0) {
        const oldValue = classSheet.getRange(rNum, colIdx).getValue();
        let newValue = formData[`b_${field}_${index}`];
        
        if (field === "Active") {
          newValue = (newValue === "true" || newValue === true || newValue === "on");
        }
        
        if (String(oldValue) !== String(newValue)) {
          classSheet.getRange(rNum, colIdx).setValue(newValue);
          if (auditLogSheet) {
            auditLogSheet.appendRow([hexCode, timestamp, memberName, `Boat[Row:${rNum}].${field}`, oldValue, newValue]);
          }
        }
      }
    });
    index++;
  }
  
  // 3. Update Tracking Sheet
  const trackingSheet = ss.getSheetByName("Tracking");
  if (trackingSheet) {
    const tData = trackingSheet.getDataRange().getValues();
    for (let k = 1; k < tData.length; k++) {
      if (String(tData[k][0]).trim() === String(hexCode).trim()) {
        trackingSheet.getRange(k + 1, 5).setValue("Updated");
        trackingSheet.getRange(k + 1, 6).setValue(timestamp);
        break;
      }
    }
  }
  
  return "Success";
}