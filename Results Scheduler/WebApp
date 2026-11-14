function doGet(e) {

  const params = e ? e.parameter : {};
  const action = params.action;

  switch (action) {
    case "triggerResults":
      return createNowTrigger();

    default:
      throw new Error("Invalid or unsupported action: " + action);
  }
}

function doPost(e) {
  let payload = {};

  try {
    payload = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    payload = e ? e.parameter : {};
  }

  const action = payload.action || e.parameter.action;
  if (action && !verifyToken(payload.token))   // markOpened stays public for the open-tracker
    return json({ success: false, code: "AUTH", error: "Unauthorized" });
  
  switch (action) {
    case "triggerResults":
      return createNowTrigger();

      default:
        throw new Error("Invalid or unsupported action: " + action);
  }
}
