function doGet(e) {
  const hexCode = (e && e.parameter) ? (e.parameter.id || e.parameter.hexCode || e.parameter.code || "") : "";
  const type = (e && e.parameter) ? (e.parameter.type || e.parameter.action || "") : "";
  
  if (type & type === "list"){
    memberList()
  } else {
    const template = HtmlService.createTemplateFromFile('Index');
    template.data = { hexCode: hexCode };
    
    return template.evaluate()
        .setTitle("SMMC Details Update")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

// MAIN FRONTEND API CALL
function getInitialData(hexCode) {
  try {
    if (!hexCode) {
      return { status: "Error", message: "No security ID provided in link." };
    }

    const memberEmail = getEmailFromTrackingCode(hexCode);
    if (!memberEmail) {
      return { status: "Error", message: "Invalid or expired link code: " + hexCode };
    }

    const data = getMemberAndBoatData(memberEmail);
    if (!data || !data.member) {
      return { status: "Error", message: "No member record found for email: " + memberEmail };
    }

    const classList = getClasses();

    return {
      status: "Success",
      hexCode: hexCode,
      member: data.member,
      boats: data.boats || [],
      classes: classList || []
    };
  } catch (err) {
    return { status: "Error", message: "Server Error: " + err.toString() };
  }
}

