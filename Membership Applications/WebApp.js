// ---------------------- VOTING WEB APP (doPost) ----------------------

function doPost(e) {
  // Check if the request is a JSON payload (from Project A) or URL parameters (from a vote form)
  let params;
  if (e.postData && e.postData.type === "application/json") {
    // This is the processing trigger from Project A
    params = JSON.parse(e.postData.contents);
    
    // Check for the special 'processRequest' key to confirm it's a sheet update request
    if (params.processRequest === true) {
      return handleProcessingRequest(params);
    }
  } else {
    // This is a standard URL-encoded vote submission
    params = e.parameter;
  }
}

/**
 * Serves web pages based on incoming URL parameters.
 */
function doGet(e) {
  if (!e) return HtmlService.createHtmlOutput('Invalid service call.');

  let rawToken = e.parameter ? e.parameter.token : null;

  // Default view: render public Membership Application Form
  if (!rawToken) {
    return HtmlService.createTemplateFromFile('ApplicationForm')
      .evaluate()
      .setTitle('SMMC - Membership Application')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (rawToken.indexOf('?token=') !== -1) {
    rawToken = rawToken.split('?token=')[1].split('&')[0];
  }

  if (rawToken.length < 6) {
    return displayApplication(rawToken);
  }

  // This checks to see if the token structure is valid
  const tokenInfo = verifyToken(rawToken);
  if (!tokenInfo || !tokenInfo.valid  || tokenInfo) {
    return HtmlService.createHtmlOutput('The link is non compliant with this system.');
  }

  // This checks to see if the token has been used or valid.
  if(tokenInfo.type !== "markPaid") {
    const validToken = validateToken(rawToken);
    if(!validToken.valid || !validToken) {
      return HtmlService.createHtmlOutput('The link is Invalid, Used or has Expired.');
    }
  }


  switch (tokenInfo.type) {
    case 'vote':
      return renderVotingForm(tokenInfo);
    case 'markPaid':
      return renderMarkPaidPage(tokenInfo);
    case 'Nominating':
    case 'Seconding':
      return renderNominationForm(tokenInfo);
    default:
      return HtmlService.createHtmlOutput('<p>Unknown action.</p>');
  }
}


