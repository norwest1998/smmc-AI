//======================================
// FILE: appsscript.html
//======================================

{
  "timeZone": "Australia/Sydney",
  "runtimeVersion": "V8",
  "dependencies": {
    "enabledAdvancedServices": []
  },
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/spreadsheets.currentonly"
  ]
}

//======================================
// FILE: config.gs
//======================================

const CONFIG = {
  masterDataID: '1nFqeV1U0c_RLaZK4amf7QR1MMwB9q8gZLc4HriUH9iI',
  appLink: 'https://docs.google.com/spreadsheets/d/1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk/edit?resourcekey=&gid=573855322#gid=573855322',
  webAppURL: 'https://script.google.com/macros/s/AKfycbyWulPkIPBPaLA4f85ygVDpJUa-e3fWpY-XOYzTQ_2gF8h9EfuWinBdTiR1DtjYWSwl9g/exec',
  membershipSheetName: 'Membership Applications',
  headersRow: 7, // headers are on this row
  dataStartRow: 8,
  // Column indexes (1-based) - adapt if your sheet differs
  colRowID: 1,               // A
  colStatus: 2,              // B
  colTimestamp: 3,           // C
  colEmail: 4,               // D applicant
  colFirstName: 5,           // E
  colSurname: 6,             // F
  colAddress: 7,             // G
  colPCode: 8,               // H
  colPhone: 9,               // I
  colEContact: 10,           // J
  colEContactPh: 11,         // K
  colMembershipType: 12,     // L
  colCurrentClub: 13,        // M
  colNominatorName: 14,      // N
  colSeconderName: 15,       // O
  colNominationDate: 16,     // P
  colSeconderDate: 17,       // Q
  colApprovedCheckbox: 18,   // R (boolean)
  colRejectionReason: 19,    // S
  colDisclaimer:20,          // T
  colCity: 21,               // U
  colReminderDate: 22,       // V
  colTurnaroundTime: 23,     // W
  colProcessedNotes: 24,     // X
  colComments: 25,           // Y
  colVotesFor: 26,           // Z
  colVotesAgainst: 27,       // AA
  colStatusUpdated: 28,      // AB
  // Tokens sheet
  tokensSheetName: 'Tokens',
  tokensHeader: ['Token','Type','Name','RowID','Used','Expiry']
  }

//======================================
// FILE: WebApp.gs
//======================================

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

  const token = params.token;
  const vote = params.vote;                 // 'for' or 'against'
  const reason = params.reason || '';
  console.log(`handling votes ${vote} Token: ${token}`);
  
  const validation = validateToken(token);
  if (!validation.valid) return HtmlService.createHtmlOutput('<p>Invalid or expired token.</p>');
  
  const rowId = validation.rowId;
  const voterEmail = validation.email;

  // record vote in sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
  const row = findRowByRowId(sheet, rowId);
  if (!row) return HtmlService.createHtmlOutput('<p>Application not found.</p>');
  const rowNumber = row;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (vote === 'approve') {
      appendVote(sheet, rowNumber, CONFIG.colVotesFor, voterEmail);
    } else if (vote === 'reject') {
      appendVote(sheet, rowNumber, CONFIG.colVotesAgainst, `${voterEmail}: ${reason}`);
    }
    // mark token used
    markTokenUsed(token);
    // after recording vote, evaluate decision
    checkForFinalApproval(sheet, rowNumber);
  } finally {
    lock.releaseLock();
  }
  return HtmlService.createHtmlOutput('<p>Thank you — your vote has been recorded.</p>');
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

  const tokenInfo = verifyToken(rawToken);
  if (!tokenInfo || !tokenInfo.valid) {
    return HtmlService.createHtmlOutput('The link is Invalid, Used or has Expired.');
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




//======================================
// FILE: WebAppProcess.gs
//======================================

function handleProcessingRequest(params) {
  try {
    const sheetId = params.sheetId;
    const rowIndex = params.rowIndex;

    console.log("In handle Process Request: " + rowIndex);
    
    // Open the spreadsheet/sheet using the ID passed in the payload
    const ss = SpreadsheetApp.openById(sheetId);
    // NOTE: Use the sheet name defined in your CONFIG if possible, otherwise use a hardcoded name
    const sheet = ss.getSheetByName(CONFIG.membershipSheetName); 
    
    if (!sheet) {
        console.log("Error: Sheet not found in Project B execution.");
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Sheet not found' }));
    }

    // --- CALL THE NECESSARY PROCESSING LOGIC HERE ---
    console.log("Update Nomination Sheet");
    const status = updateNominationStatus(sheet, rowIndex);

    // 1. Check for final approval if the comments edit might finalize a row
    if (status === 'Awaiting Approval') {
        console.log('check For Final Approval');
        checkForFinalApproval(sheet, rowIndex); 
    }

    console.log(`Successfully triggered processing for row ${rowIndex} on sheet ${sheetId}.`);
    return ContentService.createTextOutput(JSON.stringify({ status: `Successfully triggered processing for row ${rowIndex} on sheet ${sheetId}.` }));
    
  } catch (error) {
    console.log("Error in Project B's processing handler: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }));
  }
}



//======================================
// FILE: ApplicationForm.html
//======================================

<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0b1d3a 0%, #1a365d 50%, #0d253f 100%);
      background-attachment: fixed;
      color: #ffffff;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }

    body::before, body::after {
      content: '';
      position: fixed;
      border-radius: 50%;
      filter: blur(100px);
      z-index: -1;
      pointer-events: none;
    }

    body::before {
      width: 400px;
      height: 400px;
      background: rgba(0, 198, 255, 0.3);
      top: 5%;
      left: 10%;
    }

    body::after {
      width: 450px;
      height: 450px;
      background: rgba(0, 114, 255, 0.25);
      bottom: 5%;
      right: 10%;
    }

    .container {
      width: 100%;
      max-width: 850px;
    }

    .logo {
      flex-shrink: 0;
      width: 80px;
      height: 80px;
      object-fit: contain;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.35);
      box-shadow: 0 8px 24px rgba(2,12,24,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
      padding: 8px;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 30px;
    }

    .page-header h2 { 
      font-size: 1.7em;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
      text-shadow: 0 2px 12px rgba(0,0,0,0.25);
      margin: 0 0 6px;
    }

    .page-header p { 
      color: rgba(255, 255, 255, 0.8) !important;
      font-size: 0.85rem;
      line-height: 1.3;
      margin: 0;
    }

    .glass-section {
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.3);
      border-radius: 28px;
      padding: 30px;
      margin-bottom: 30px;
    }

    .glass-section h3 { 
      color: #ffffff !important; 
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 20px;
      letter-spacing: -0.3px;
    }

    .grid-2-col {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    @media (max-width: 640px) {
      .grid-2-col { grid-template-columns: 1fr; }
      .page-header { flex-direction: column; text-align: center; }
    }

    .full-width { grid-column: 1 / -1; }

    .form-group {
      display: flex;
      flex-direction: column;
      margin-bottom: 10px;
    }

    .form-group label {
      margin-bottom: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85) !important;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    input[type="text"], 
    input[type="email"], 
    input[type="tel"],
    select { 
      color: #ffffff !important; 
      background: rgba(255, 255, 255, 0.15) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      border-radius: 50px !important;
      padding: 12px 20px !important; 
      font-size: 0.95rem;
      font-family: inherit;
      width: 100%;
      box-sizing: border-box;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: all 0.25s ease;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
      outline: none;
      appearance: none;
      -webkit-appearance: none;
    }

    select {
      background-image: url("data:image/svg+xml;utf8,<svg fill='white' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/></svg>") !important;
      background-repeat: no-repeat !important;
      background-position: right 18px center !important;
      padding-right: 45px !important;
      cursor: pointer;
    }

    select option {
      background-color: #0d253f;
      color: #ffffff;
    }

    input:focus, select:focus { 
      background-color: rgba(255, 255, 255, 0.25) !important;
      border-color: rgba(255, 255, 255, 0.7) !important;
      box-shadow: 0 0 15px rgba(0, 198, 255, 0.3), inset 0 1px 3px rgba(0,0,0,0.1);
    }

    .checkbox-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 12px 20px;
      border-radius: 50px;
      cursor: pointer;
      user-select: none;
      transition: all 0.25s ease;
      margin-top: 10px;
      font-size: 0.88rem;
    }

    .checkbox-pill:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .checkbox-pill input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #00c6ff;
      cursor: pointer;
    }

    .btn-pill {
      background: linear-gradient(135deg, rgba(0, 198, 255, 0.8), rgba(0, 114, 255, 0.8));
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.4);
      padding: 16px 32px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 50px;
      cursor: pointer;
      width: 100%;
      letter-spacing: 0.5px;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
      box-shadow: 0 8px 25px rgba(0, 114, 255, 0.3);
      margin-top: 10px;
    }

    .btn-pill:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0, 198, 255, 0.5);
      background: linear-gradient(135deg, rgba(0, 198, 255, 0.95), rgba(0, 114, 255, 0.95));
    }

    .hidden { display: none !important; }

    #progressModal {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: opacity 0.3s ease;
    }

    .progress-card {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.25);
      padding: 30px 35px;
      border-radius: 24px;
      backdrop-filter: blur(20px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      width: 100%;
      max-width: 400px;
      text-align: center;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: #00c6ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 15px auto;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .status-alert {
      margin-top: 20px;
      padding: 16px 20px;
      border-radius: 50px;
      font-size: 0.92rem;
      text-align: center;
      font-weight: 500;
    }
    .status-success { background: rgba(0, 230, 118, 0.2); border: 1px solid rgba(0, 230, 118, 0.5); color: #00e676; }
    .status-error { background: rgba(255, 82, 82, 0.2); border: 1px solid rgba(255, 82, 82, 0.5); color: #ff5252; }
  </style>
</head>

<body>

  <div id="progressModal" class="hidden">
    <div class="progress-card">
      <div class="spinner"></div>
      <div style="font-size: 1.1rem; font-weight: 600; color: #ffffff;" id="progressText">Submitting Application...</div>
    </div>
  </div>

  <div class="container">
    <div class="page-header">
      <img class="logo" src="https://lh3.googleusercontent.com/d/1jy49r9b2qUZbDY31PIhJPE2QmFngPRNg=w200?authuser=0" alt="Logo">
      <div>
        <h2>SMMC Membership Application</h2>
        <p>Please complete all required details below to apply for membership with the Sydney Maritime Modellers Club.</p>
      </div>
    </div>

    <form id="appForm">
      <div class="glass-section">
        <h3>Applicant Information</h3>
        <div class="grid-2-col">
          
          <div class="form-group">
            <label>First Name</label>
            <input type="text" id="firstName" required>
          </div>

          <div class="form-group">
            <label>Surname</label>
            <input type="text" id="surname" required>
          </div>

          <div class="form-group full-width">
            <label>Email Address</label>
            <input type="email" id="email" required>
          </div>

          <div class="form-group full-width">
            <label>Address Line</label>
            <input type="text" id="address" required>
          </div>

          <div class="form-group">
            <label>City / Suburb</label>
            <input type="text" id="city" required>
          </div>

          <div class="form-group">
            <label>Post Code</label>
            <input type="text" id="pCode" required>
          </div>

          <div class="form-group full-width">
            <label>Phone Number</label>
            <input type="tel" id="phone" required>
          </div>

          <div class="form-group">
            <label>Emergency Contact Name</label>
            <input type="text" id="eContact" required>
          </div>

          <div class="form-group">
            <label>Emergency Contact Phone</label>
            <input type="tel" id="eContactPh" required>
          </div>

        </div>
      </div>

      <div class="glass-section">
        <h3>Club Nomination Details</h3>
        <div class="grid-2-col">
          
          <div class="form-group">
            <label>Membership Type</label>
            <select id="membershipType" required>
              <option value="" disabled selected>Select Membership Type...</option>
              <option value="Full Membership">Full Membership</option>
              <option value="Affiliate Membership">Affiliate Membership</option>
            </select>
          </div>

          <div class="form-group">
            <label>Current Club Name (If applicable)</label>
            <input type="text" id="currentClub">
          </div>

          <div class="form-group">
            <label>Nominating Member</label>
            <select id="nominator" required>
              <option value="" disabled selected>Loading members list...</option>
            </select>
          </div>

          <div class="form-group">
            <label>Seconding Member</label>
            <select id="seconder" required>
              <option value="" disabled selected>Loading members list...</option>
            </select>
          </div>

          <div class="form-group full-width">
            <label class="checkbox-pill">
              <input type="checkbox" id="disclaimer" required>
              <span>I agree to abide by the SMMC constitution and club safety guidelines.</span>
            </label>
          </div>

        </div>
      </div>

      <button type="submit" id="submitBtn" class="btn-pill">Submit Application</button>
    </form>

    <div id="statusAlert" class="hidden"></div>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      google.script.run
        .withSuccessHandler(populateMemberDropdowns)
        .withFailureHandler(() => showAlert('Failed to load active member list.', false))
        .getMembersList();
    });

    function populateMemberDropdowns(members) {
      const nomSelect = document.getElementById('nominator');
      const secSelect = document.getElementById('seconder');
      
      let options = '<option value="" disabled selected>Select Club Member...</option>';
      members.forEach(m => {
        options += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`;
      });

      nomSelect.innerHTML = options;
      secSelect.innerHTML = options;
    }

    document.getElementById('appForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const modal = document.getElementById('progressModal');
      modal.classList.remove('hidden');

      const formData = {
        firstName: document.getElementById('firstName').value.trim(),
        surname: document.getElementById('surname').value.trim(),
        email: document.getElementById('email').value.trim(),
        address: document.getElementById('address').value.trim(),
        city: document.getElementById('city').value.trim(),
        pCode: document.getElementById('pCode').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        eContact: document.getElementById('eContact').value.trim(),
        eContactPh: document.getElementById('eContactPh').value.trim(),
        membershipType: document.getElementById('membershipType').value,
        currentClub: document.getElementById('currentClub').value.trim(),
        nominator: document.getElementById('nominator').value,
        seconder: document.getElementById('seconder').value,
        disclaimer: document.getElementById('disclaimer').checked
      };

      google.script.run
        .withSuccessHandler(res => {
          modal.classList.add('hidden');
          if (res.success) {
            showAlert(res.message, true);
            document.getElementById('appForm').reset();
          } else {
            showAlert('Submission failed: ' + res.message, false);
          }
        })
        .withFailureHandler(err => {
          modal.classList.add('hidden');
          showAlert('System Error: ' + err, false);
        })
        .submitApplication(formData);
    });

    function showAlert(msg, isSuccess) {
      const alert = document.getElementById('statusAlert');
      alert.textContent = msg;
      alert.className = 'status-alert ' + (isSuccess ? 'status-success' : 'status-error');
      alert.classList.remove('hidden');
    }

    function escapeHtml(text) {
      return text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
    }
  </script>

</body>
</html>

//======================================
// FILE: processApplication.gs
//======================================

/**
 * Processes submission from HTML Membership Application page.
 */
function submitApplication(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.membershipSheetName);

    const rowId = (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toLowerCase();
    const now = new Date();
    const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const reminderDate = new Date(now);
    reminderDate.setDate(reminderDate.getDate() + 2);

    const applicantName = `${formData.firstName} ${formData.surname}`.trim();

    // Construct 1-based indexed row matching sheet schema
    const newRow = [];
    newRow[CONFIG.colRowID - 1] = rowId;
    newRow[CONFIG.colStatus - 1] = 'Received';
    newRow[CONFIG.colTimestamp - 1] = myDateTime;
    newRow[CONFIG.colEmail - 1] = formData.email;
    newRow[CONFIG.colFirstName - 1] = formData.firstName;
    newRow[CONFIG.colSurname - 1] = formData.surname;
    newRow[CONFIG.colAddress - 1] = formData.address;
    newRow[CONFIG.colPCode - 1] = formData.pCode;
    newRow[CONFIG.colPhone - 1] = formData.phone;
    newRow[CONFIG.colEContact - 1] = formData.eContact;
    newRow[CONFIG.colEContactPh - 1] = formData.eContactPh;
    newRow[CONFIG.colMembershipType - 1] = formData.membershipType;
    newRow[CONFIG.colCurrentClub - 1] = formData.currentClub;
    newRow[CONFIG.colNominatorName - 1] = formData.nominator;
    newRow[CONFIG.colSeconderName - 1] = formData.seconder;
    newRow[CONFIG.colDisclaimer - 1] = formData.disclaimer ? 'Yes' : 'No';
    newRow[CONFIG.colCity - 1] = formData.city;
    newRow[CONFIG.colReminderDate - 1] = Utilities.formatDate(reminderDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    newRow[CONFIG.colProcessedNotes - 1] = `Application received via Web Form at: ${myDateTime}\n`;
    newRow[CONFIG.colStatusUpdated - 1] = myDateTime;

    sheet.appendRow(newRow);
    const lastRow = sheet.getLastRow();

    // Generate tokens & dispatch notification emails
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 14);
    const lockSheet = ss.getSheetByName('Tokens');

    // 1. Email to Nominator
    let nominatorEmail = getNominatorEmails(formData.nominator);
    if (nominatorEmail && nominatorEmail !== "Not found") {
      let type = 'Nominating';
      let token = generateToken(type, nominatorEmail, applicantName, rowId, expiry);
      lockSheet.appendRow([token, type, formData.nominator, rowId, false, expiry]);
      let baseURL = CONFIG.webAppURL + '?token=' + encodeURIComponent(token);
      const {plainTextBody: nomPlain, htmlBody: nomHtml} = createNominatorSeconderEmail(type, applicantName, lastRow, formData.email, myDateTime, baseURL);
      addProcessNote(sheet, lastRow, `Nomination eMail sent to nominating member: ${nominatorEmail} at: ${myDateTime}`);
      MailApp.sendEmail({to: nominatorEmail, subject: `Membership nomination for ${applicantName}`, body: nomPlain, htmlBody: nomHtml});
    }

    // 2. Email to Seconder
    let seconderEmail = getNominatorEmails(formData.seconder);
    if (seconderEmail && seconderEmail !== "Not found") {
      let type = 'Seconding';
      let token = generateToken(type, seconderEmail, applicantName, rowId, expiry);
      lockSheet.appendRow([token, type, formData.seconder, rowId, false, expiry]);
      let baseURL = CONFIG.webAppURL + '?token=' + encodeURIComponent(token);
      const {plainTextBody: secPlain, htmlBody: secHtml} = createNominatorSeconderEmail(type, applicantName, lastRow, formData.email, myDateTime, baseURL);
      addProcessNote(sheet, lastRow, `Nomination eMail sent to seconding member: ${seconderEmail} at: ${myDateTime}`);
      MailApp.sendEmail({to: seconderEmail, subject: `Membership seconding for ${applicantName}`, body: secPlain, htmlBody: secHtml});
    }

    return { success: true, message: `Application for ${applicantName} submitted successfully!` };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}


//======================================
// FILE: emailProcessing.gs
//======================================

// Helper function to send the final approval/rejection email to the applicant
function sendFinalApplicantEmail(sheet, row, finalStatus) {
    const applicantEmail = sheet.getRange(row, CONFIG.colEmail).getValue();
    const membershipType = sheet.getRange(row, CONFIG.colMembershipType).getValue();

    const whatsAppLink = PropertiesService.getScriptProperties().getProperty("WhatsAppInviteURL");
    const facebookLink = PropertiesService.getScriptProperties().getProperty("FacebookURL");
    const websiteLink = PropertiesService.getScriptProperties().getProperty("ClubWebsiteURL");

    if (finalStatus === "Approved") {
        const subject = "SMMC Membership Application Approved";
        let plainTextBody = `Dear Applicant,\n\nCongratulations! Your application has been approved.`;
        let htmlBody = `<p>Dear Applicant,</p><p>Congratulations! Your application has been approved.</p>`;

        if (membershipType.includes("Full")) {
             plainTextBody += `\n\nPlease ensure you pay the following fees:\nJoining Fee: $15\nAnnual Membership (Full): $45\nTotal: $60`;
             htmlBody += `<p>Please ensure you pay the following fees:</p><ul><li>Joining Fee: $15</li><li>Annual Membership (Full): $45</li><li>Total: $60</li></ul>`;
        } else {
             plainTextBody += `\n\nPlease ensure you pay the following fees:\nJoining Fee: $15\nAffiliated Club member: $30\nTotal: $45`;
             htmlBody += `<p>Please ensure you pay the following fees:</p><ul><li>Joining Fee: $15</li><li>Affiliated Club member: $30</li><li>Total: $45</li></ul>`;
        }

        plainTextBody += `\n\nPlease join our community on Social Media:\nWhatsApp: ${whatsAppLink}\nFacebook: ${facebookLink}\nKeep an eye on the club web site for sailing calendar and updates: ${websiteLink}\n\nBest regards,\nThe SMMC Committee`;
        htmlBody += `<p>Please join our community on Social Media:</p>
        <p><a href="${whatsAppLink}" target="_blank" style="text-decoration: none; color: #000;">
        <img src="https://upload.wikimedia.org/wikipedia/commons/f/f6/Whatsapp_tile_logo_icon_169898.png" width="32" height="32" style="vertical-align:middle; margin-right: 8px;"><span style="font-size: 14px; vertical-align:middle;">Join WhatsApp</span></a></p>
        <p><a href="${facebookLink}" target="_blank" style="text-decoration: none; color: #000;">
        <img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png" width="32" height="32" style="vertical-align:middle; margin-right: 8px;"><span style="font-size: 14px; vertical-align:middle;">Join Facebook</span></a></p>
        <p><a href="${websiteLink}" target="_blank" style="text-decoration: none; color: #000;">
        <img src="https://smmc1998.weebly.com/uploads/1/0/2/3/102349134/smmc-logo.jpg" width="32" height="32" style="vertical-align:middle; margin-right: 8px;"><span style="font-size: 14px; vertical-align:middle;">Keep an eye on the club web site for sailing calendar and updates</span></a></p>
        <p>Best regards,<br>The SMMC Committee</p>`;

        MailApp.sendEmail({to: applicantEmail, subject, body: plainTextBody, htmlBody});
        
    } else if (finalStatus === "Rejected") {
        const plainTextBody = `Dear Applicant,\nWe regret to inform you that your application has not been approved.\nWe thank you for your interest in joining our club.\n\nBest regards,\nThe SMMC Committee`;
        const htmlBody = `<p>Dear Applicant,</p><p>We regret to inform you that your application has not been approved.</p><p>We thank you for your interest in joining our club.</p><p>Best regards,<br>The SMMC Committee</p>`;
        MailApp.sendEmail({to: applicantEmail, subject: "Application Rejected", body: plainTextBody, htmlBody});
    }
}

/**
 * Sends a notification and unique web form link to *all* approving committee members.
 */
function sendCommitteeApprovalRequest(sheet, applicantRow) {
console.log("In sendCommitteeApprovalRequest, applicantRow: " + applicantRow);
  const allCommitteeEmails = getCommitteeEmails(3, 6); // Column 6 (Send Vote Mail)
  const rowId = sheet.getRange(applicantRow, CONFIG.colRowID).getValue();
  const committeeNames = getCommitteeEmails(2, 6, true); // Column 2 (Name), Column 6 (Send Vote Mail)
  const applicantName = sheet.getRange(applicantRow, CONFIG.colFirstName).getValue() + " " + sheet.getRange(applicantRow, CONFIG.colSurname).getValue();
  const applicantEmail = sheet.getRange(applicantRow, CONFIG.colEmail).getValue();
  const timestamp = sheet.getRange(applicantRow, CONFIG.colTimestamp).getValue();
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});

  // Get the published Web App URL (must be manually published first!)
  
  const lockSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tokens');
  
  if (!lockSheet) {
    console.log('Token Lock sheet not found. Cannot send approval request with secure links.');
    return;
  }
  
  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 14); // Tokens expire in 14 days
  
  if (allCommitteeEmails.length > 0) {
    allCommitteeEmails.forEach((committeeEmail, index) => {
      const committeeName = committeeNames[index];
      const type = 'vote';
      const token = generateToken(type, committeeName, applicantName, rowId, expiry);
   
      // 1. Save Token to Lock Sheet
      lockSheet.appendRow([token, type, committeeName, rowId, false, expiry]); // Token, Row Index, Used, Expiry
      var urltoken = encodeURIComponent(token); 
      
      // 2. Create Vote URL
      const voteUrl = `${CONFIG.webAppURL}?token=${urltoken}&member=${encodeURIComponent(committeeEmail)}&applicant=${encodeURIComponent(applicantName)}`;
      
      // 3. Send Individual Email
      const emailSubject = 'New membership application awaiting your vote: ' + applicantName;
      const {plainTextBody, htmlBody} = createVoteRequestEmail(committeeName, applicantName, applicantRow, applicantEmail, formattedTimestamp, voteUrl);
      addProcessNote(sheet, applicantRow, `Approval vote request sent to: ${committeeEmail} at: ${formattedTimestamp}`);
      MailApp.sendEmail({to: committeeEmail, subject: emailSubject, body: plainTextBody, htmlBody: htmlBody});
      console.log(`Sent vote request to ${committeeEmail} for application ${applicantName}`);
    });
  }
}

// Full vote request email template
function createVoteRequestEmail(committeeName, applicantName, applicantRow, applicantEmail, formattedTimestamp, voteUrl) {
  const appLink = CONFIG.webAppURL + `?token=${applicantRow}`;
  const plainTextBody = `Dear ${committeeName},
A membership application for ${applicantName} has been processed and is now awaiting your official vote.
Applicant: ${applicantName}
Email: ${applicantEmail}
Submitted: ${formattedTimestamp}

Please click the secure link below to cast your vote (Approved or Rejected with reason):
${voteUrl}

Review the application details here:
${appLink}

Best regards,
Your Admin AutoBot`;

  const htmlBody = `<p>Dear ${committeeName},</p>
<p>An application for <b>${applicantName}</b> has been processed and is now awaiting your official vote.</p>
<ul>
<li>Applicant: ${applicantName}</li>
<li>Email: ${applicantEmail}</li>
<li>Submitted: ${formattedTimestamp}</li>
</ul>

<p><b>Please cast your vote using the secure link below:</b></p>
<p><a href="${voteUrl}" target="_blank" style="text-decoration: none; background-color: #4CAF50; color: white; padding: 10px 20px; text-align: center; display: inline-block; border-radius: 5px;">
<span style="font-size: 16px; vertical-align:middle;">Cast Your Vote Now</span>
</a></p>

<p>You can review the application details here:<br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Google sheet</span></a></p>

<p>Best regards,<br>Your Admin AutoBot</p>`;

    return {plainTextBody, htmlBody};
}

// Helper function for Committee Notification Email
function createCommitteeNotificationEmail(applicantName, applicantRow, applicantEmail, myDateTime) {
  const applicationLink = CONFIG.webAppURL + "?token=" + applicantRow;
  const plainTextBody = `Committee member,
A new application has been submitted.
Applicant: ${applicantName}
Email: ${applicantEmail}
Submitted: ${myDateTime}
Please view the application in the link below to assess the submission.
Application Link: ${applicationLink}
Your Admin AutoBot`;
    
    const htmlBody = `<p>Committee member,</p>
<p>A new member application has been submitted.</p>
<p>Please view the application in the link below to assess the submission.</p>
<ul>
<li>Applicant: ${applicantName}</li>
<li>Email : ${applicantEmail}</li>
<li>Submitted: ${myDateTime}</li>
</ul>
<p>Thank you for your assistance.</p>
<p>You can view the application here:<br><br>
<a href="${applicationLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open application" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">View the membership application</span>
</a></p>
<p>Best regards,<br>Your Admin AutoBot</p>`;
    
    return {plainTextBody, htmlBody};
}

// Helper function for Nominator/Seconder Email
function createNominatorSeconderEmail(role, applicantName, applicantRow, applicantEmail, myDateTime, baseURL) {
  const appLink = CONFIG.webAppURL + "?token=" + applicantRow;
  const plainTextBody = `${role} member,
A new application has been submitted with you as a ${role.toLowerCase()} member.
Applicant: ${applicantName}
Email: ${applicantEmail}
Submitted: ${myDateTime}
Please provide your comments on this application using the form in the link below.
Application Link: ${baseURL}

You can view the application here: ${appLink}
Your Admin AutoBot`;

    const htmlBody = `<p>${role} member,</p>
<p>A new member application has been submitted.</p>
<ul><li>Applicant: ${applicantName}</li><li>Email : ${applicantEmail}</li><li>Submitted: ${myDateTime}</li></ul>
<p>Thank you for your assistance.</p>
<p>You can access the nomination form here:<br><br>
<a href="${baseURL}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Form" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Member Nomination Form from the SMMC Google Drive</span></a></p>

<p>You can review the application here:<br><br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open application" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">View the Application from the SMMC Google Drive</span></a></p>

<p>Best regards,<br>Your Admin AutoBot</p>`;
    
    return {plainTextBody, htmlBody};
}

function sendDeliberationEmails(sheet, row) {

  // get voting committeee members
  // show Against voting member
  // show rejection reason
  // show application record
  // create new vote token 
  // create new vote Url 
  // send email 
  // update process notes

  console.log("In sendDeliberationEmails, row: " + row);

  const allCommitteeEmails = getCommitteeEmails(3, 6); // Column 6 (Send Vote Mail)
  const rowId = sheet.getRange(row, CONFIG.colRowID).getValue();
  const committeeNames = getCommitteeEmails(2, 6, true); // Column 2 (Name), Column 6 (Send Vote Mail)
  const applicantName = sheet.getRange(row, CONFIG.colFirstName).getValue() + " " + sheet.getRange(row, CONFIG.colSurname).getValue();
  const applicantEmail = sheet.getRange(row, CONFIG.colEmail).getValue();
  const timestamp = sheet.getRange(row, CONFIG.colTimestamp).getValue();
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
  const rejectedBy = sheet.getRange(row, CONFIG.colVotesAgainst).getValue();
  const reason = sheet.getRange(row, CONFIG.colRejectionReason).getValue();

  // Get the published Web App URL (must be manually published first!)
  
  const lockSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tokens');
  
  if (!lockSheet) {
    console.log('Token Lock sheet not found. Cannot send approval request with secure links.');
    return;
  }
  
  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 14); // Tokens expire in 14 days

  // email constants
  const emailSubject = 'Membership application now in deliberation: ' + applicantName;
  const appLink = CONFIG.webAppURL + `?token=${row}`;
  const plainBodyText1 = 
`A membership application for ${applicantName} has been rejected by a voting committee member. All votes have been cancelled and a revote will now commence. Please discuss the application with the other voting committee members.

Applicant: ${applicantName}
Email    : ${applicantEmail}
Submitted: ${formattedTimestamp}

Rejector : ${rejectedBy}
Reason   : ${reason}

`;
  const plainBodyText2 = 
`Review the application details here:
${appLink}

Best regards,
Your Admin AutoBot`;

  const htmlBodyText1 = 
`<p>The application for <b>${applicantName}</b> has been rejected by a voting committee member. All votes have been cancelled and a revote will now commence.</p>
<p>Please discuss the application with the other voting committee members.</p>

<ul>
<li>Applicant: ${applicantName}</li>
<li>Email    : ${applicantEmail}</li>
<li>Submitted: ${formattedTimestamp}</li>
</ul>

<p>Rejector  : ${rejectedBy}</p>
<p>Reason    : ${reason}</p>

<p><b>Please cast your vote using the secure link below:</b></p>
`;

  const htmlBodyText2 =
`<p>You can review the application details here:<br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">view application in your browser</span></a></p>

<p>Best regards,<br>Your Admin AutoBot</p>`;  


  if (allCommitteeEmails.length > 0) {
    allCommitteeEmails.forEach((committeeEmail, index) => {
      const committeeName = committeeNames[index];
      const type = 'vote';
      const token = generateToken(type, committeeName, applicantName, rowId, expiry);
   
      // 1. Save Token to Lock Sheet
      lockSheet.appendRow([token, type, committeeName, rowId, false, expiry]); // Token, Row Index, Used, Expiry
      var urltoken = encodeURIComponent(token); 
      
      // 2. Create Vote URL
      const voteUrl = `${CONFIG.webAppURL}?token=${urltoken}&member=${encodeURIComponent(committeeEmail)}&applicant=${encodeURIComponent(applicantName)}`;
      
      const plainTextBody = `Dear ${committeeName},
${plainBodyText1} 

Please click the secure link below to cast your vote (Approved or Rejected with reason):
${voteUrl}

${plainBodyText2}`;

      const htmlBody = `<p>Dear ${committeeName},</p>
      
      ${htmlBodyText1}
<p><a href="${voteUrl}" target="_blank" style="text-decoration: none; background-color: #4CAF50; color: white; padding: 10px 20px; text-align: center; display: inline-block; border-radius: 5px;">
<span style="font-size: 16px; vertical-align:middle;">Cast Your Vote Now</span>
</a></p>

${htmlBodyText2}`;

      // send email
      MailApp.sendEmail({to: committeeEmail, subject: emailSubject, body: plainTextBody, htmlBody: htmlBody});
      addProcessNote(sheet, row, `Approval re-vote request sent to: ${committeeEmail} at: ${formattedTimestamp}`);
      console.log(`Sent re-vote request to ${committeeEmail} for application ${applicantName}`);
    });
  }
  
}


function getNominatorEmails(nominator) {
  const memberSpreadsheet = SpreadsheetApp.openById(CONFIG.masterDataID);
  const membersSheet = memberSpreadsheet.getSheetByName("Members");
  const lastRow = membersSheet.getLastRow();
  const data = membersSheet.getRange(2, 3, lastRow - 1, 7).getValues();
  for (let i = 0; i < data.length; i++) {
    const name = data[i][0];
    const email = data[i][6];
    if (name && name.toString().trim().toLowerCase() === nominator.trim().toLowerCase()) return email;
  }
  return "Not found";
}

//======================================
// FILE: NominatingForm.html
//======================================

<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0b1d3a 0%, #1a365d 50%, #0d253f 100%);
      background-attachment: fixed;
      color: #ffffff;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }

    body::before, body::after {
      content: '';
      position: fixed;
      border-radius: 50%;
      filter: blur(100px);
      z-index: -1;
      pointer-events: none;
    }

    body::before {
      width: 400px; height: 400px;
      background: rgba(0, 198, 255, 0.3);
      top: 5%; left: 10%;
    }

    body::after {
      width: 450px; height: 450px;
      background: rgba(0, 114, 255, 0.25);
      bottom: 5%; right: 10%;
    }

    .container { width: 100%; max-width: 700px; }

    .logo {
      flex-shrink: 0;
      width: 80px; height: 80px;
      object-fit: contain;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.35);
      box-shadow: 0 8px 24px rgba(2,12,24,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
      padding: 8px;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 30px;
    }

    .page-header h2 { 
      font-size: 1.7em; font-weight: 800;
      letter-spacing: -0.02em; color: #ffffff;
      text-shadow: 0 2px 12px rgba(0,0,0,0.25);
      margin: 0 0 6px;
    }

    .page-header p { 
      color: rgba(255, 255, 255, 0.8) !important;
      font-size: 0.85rem; line-height: 1.3; margin: 0;
    }

    .glass-section {
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.3);
      border-radius: 28px;
      padding: 30px;
      margin-bottom: 30px;
    }

    .info-card {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      padding: 16px 20px;
      border-radius: 16px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .info-card p { font-size: 0.92rem; color: rgba(255,255,255,0.8); }
    .info-card strong { color: #00c6ff; }

    .form-group {
      display: flex;
      flex-direction: column;
      margin-bottom: 20px;
    }

    .form-group label {
      margin-bottom: 10px;
      font-size: 0.82rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85) !important;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .radio-pill-group {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .radio-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 12px 24px;
      border-radius: 50px;
      cursor: pointer;
      user-select: none;
      transition: all 0.25s ease;
      font-size: 0.95rem;
    }

    .radio-pill:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .radio-pill input[type="radio"] {
      width: 16px;
      height: 16px;
      accent-color: #00c6ff;
      cursor: pointer;
    }

    textarea { 
      color: #ffffff !important; 
      background: rgba(255, 255, 255, 0.15) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      border-radius: 20px !important;
      padding: 14px 20px !important; 
      font-size: 0.95rem;
      font-family: inherit;
      width: 100%;
      box-sizing: border-box;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: all 0.25s ease;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
      outline: none;
      resize: vertical;
    }

    textarea:focus { 
      background-color: rgba(255, 255, 255, 0.25) !important;
      border-color: rgba(255, 255, 255, 0.7) !important;
      box-shadow: 0 0 15px rgba(0, 198, 255, 0.3), inset 0 1px 3px rgba(0,0,0,0.1);
    }

    .btn-pill {
      background: linear-gradient(135deg, rgba(0, 198, 255, 0.8), rgba(0, 114, 255, 0.8));
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.4);
      padding: 16px 32px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 50px;
      cursor: pointer;
      width: 100%;
      letter-spacing: 0.5px;
      transition: all 0.3s ease;
      box-shadow: 0 8px 25px rgba(0, 114, 255, 0.3);
    }

    .btn-pill:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0, 198, 255, 0.5);
      background: linear-gradient(135deg, rgba(0, 198, 255, 0.95), rgba(0, 114, 255, 0.95));
    }

    .hidden { display: none !important; }

    #progressModal {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
    }

    .progress-card {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.25);
      padding: 30px 35px; border-radius: 24px;
      backdrop-filter: blur(20px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      text-align: center;
    }

    .spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: #00c6ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 15px auto;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .status-alert {
      margin-top: 20px;
      padding: 18px 24px;
      border-radius: 20px;
      font-size: 0.95rem;
      text-align: center;
      background: rgba(0, 230, 118, 0.2);
      border: 1px solid rgba(0, 230, 118, 0.5);
      color: #00e676;
    }
  </style>
</head>

<body>

  <div id="progressModal" class="hidden">
    <div class="progress-card">
      <div class="spinner"></div>
      <div style="font-size: 1.1rem; font-weight: 600; color: #ffffff;">Submitting Support Response...</div>
    </div>
  </div>

  <div class="container">
    <div class="page-header">
      <img class="logo" src="https://lh3.googleusercontent.com/d/1jy49r9b2qUZbDY31PIhJPE2QmFngPRNg=w200?authuser=0" alt="Logo">
      <div>
        <h2>Nomination Support Form</h2>
        <p>Sydney Maritime Modellers Club - Member Nomination & Seconding Validation</p>
      </div>
    </div>

    <div class="glass-section">
      <div class="info-card">
        <p>Applicant Name: <strong><?= applicantName ?></strong></p>
        <p>Reviewing Member: <strong><?= committeeMember ?></strong></p>
      </div>

      <form id="nominationForm">
        <input type="hidden" name="token" value="<?= token ?>">

        <div class="form-group">
          <label>Do you support this applicant's nomination?</label>
          <div class="radio-pill-group">
            <label class="radio-pill">
              <input type="radio" name="agree" value="Yes" required>
              <span>Yes, I Support</span>
            </label>
            <label class="radio-pill">
              <input type="radio" name="agree" value="No">
              <span>No, I Do Not Support</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="comments">Character Compatibility & Comments (Required)</label>
          <textarea id="comments" name="comments" rows="4" placeholder="Please provide brief comments regarding character compatibility..." required></textarea>
        </div>

        <button type="submit" class="btn-pill">Submit Nomination Response</button>
      </form>

      <div id="statusAlert" class="hidden status-alert"></div>
    </div>
  </div>

  <script>
    document.getElementById('nominationForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const modal = document.getElementById('progressModal');
      modal.classList.remove('hidden');

      const params = {
        token: this.token.value,
        agree: this.querySelector('input[name="agree"]:checked').value,
        comments: this.comments.value.trim()
      };

      google.script.run
        .withSuccessHandler(function(response) {
          modal.classList.add('hidden');
          document.getElementById('nominationForm').style.display = 'none';
          const alert = document.getElementById('statusAlert');
          alert.textContent = response;
          alert.classList.remove('hidden');
        })
        .withFailureHandler(function(error) {
          modal.classList.add('hidden');
          alert('System Error: ' + error);
        })
        .handleNomination(params);
    });
  </script>

</body>
</html>

//======================================
// FILE: Response.gs
//======================================

// // FILE: Responses.gs (Reworked)

/**
 * Main onEdit trigger function.
 */
function installableOnEdit(e) {
  const sheet = e.source.getActiveSheet();
  const row = e.range.getRow();
  const col = e.range.getColumn();
  
  // Only process data rows (starting from row 8, data start row)
  if (row < CONFIG.dataStartRow) return; 

  // 1. Nomination/Seconder Date Update
  if ([CONFIG.colNominationDate, CONFIG.colSeconderDate].includes(col)) {
    updateNominationStatus(sheet, row);
  } 
  // 2. Committee Vote/Approval Manual Edit (Primarily for Votes For/Against or a direct 'Approved' tick)
  else if (col === CONFIG.colApprovedCheckbox || col === CONFIG.colRejectionReason || col === CONFIG.colVotesFor || col === CONFIG.colVotesAgainst) {
    // Check for final approval if a finalization column is manually edited
    checkForFinalApproval(sheet, row);
  }
}

/**
 * Updates status based on Nominator/Seconder responses.
 */
function updateNominationStatus(sheet, row) {
  console.log("In Nomination update");
  const nominationDate = sheet.getRange(row, CONFIG.colNominationDate).getValue();
  const seconderNominationDate = sheet.getRange(row, CONFIG.colSeconderDate).getValue();
  const status = sheet.getRange(row, CONFIG.colStatus).getValue();
  let newStatus = status;

  console.log('Status: ' + status + " Nom date: " + nominationDate + " sec Date: " + seconderNominationDate);
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

  if (nominationDate && seconderNominationDate && newStatus !== 'Awaiting Approval') {
    newStatus = 'Awaiting Approval';
    addProcessNote(sheet, row, `Status Changed at: ${myDateTime} new status: ${newStatus}`);
    console.log("New Status: Awaiting Approval, going to sendCommitteeApprovalRequest");
    sendCommitteeApprovalRequest(sheet, row); 
  } else if ((nominationDate || seconderNominationDate) && newStatus === 'Received') {
    newStatus = 'In Progress';
    console.log("New Status: In Progress");
    addProcessNote(sheet, row, `Status Changed at: ${myDateTime}, new status: ${newStatus}`);
  }

  if (newStatus !== status) sheet.getRange(row, CONFIG.colStatus).setValue(newStatus);
  
  // Update reminder date regardless of status change
  updateReminderDate(row);
  addProcessNote(sheet, row, `Reminder date updated to: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")} at: ${myDateTime}`)

  return newStatus;
}

function checkForFinalApproval(sheet, row) {
  // Called when Approved checkbox or Rejection reason changes
  const approved = sheet.getRange(row, CONFIG.colApprovedCheckbox).getValue();
  const rejectionReason = sheet.getRange(row, CONFIG.colRejectionReason).getValue();
  const status = sheet.getRange(row, CONFIG.colStatus).getValue();
  const applicantEmail = sheet.getRange(row, CONFIG.colEmail).getValue();
  const membershipType = sheet.getRange(row, CONFIG.colMembershipType).getValue();

  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  if (approved && rejectionReason) {
    // cannot approve when rejection reason exists
    sheet.getRange(row, CONFIG.colApprovedCheckbox).setValue(false);
    SpreadsheetApp.getUi().alert('Approval cannot be granted because there is a rejection reason.');
    // Need to add logic here to cater for change of status --- Awaiting Approval or Attentiopn required...
    return;
  }

  // Primary decision engine: rely on Votes For/Against
  const votesFor = parseList(sheet.getRange(row, CONFIG.colVotesFor).getValue());
  const votesAgainst = parseList(sheet.getRange(row, CONFIG.colVotesAgainst).getValue());
  const committee = getApprovingCommitteeMembers();
  const approverCount = committee.length;

  // If any vote against -> rejected
  if (votesAgainst.length > 0) {
    finalizeDecision(row, 'Rejected', votesAgainst.join(', '));
    sheet.getRange(row, CONFIG.colApprovedCheckbox).setValue(false);
    return;
  }
  // If all committee members have voted for -> approved
  if (votesFor.length === approverCount && approverCount > 0) {
    addProcessNote(sheet, row, `New application votes tallied Approved decision added at ${now.toISOString()}`);
    finalizeDecision(row, 'Approved', 'All committee members voted in favour');
    sheet.getRange(row, CONFIG.colApprovedCheckbox).setValue(true);
    addApprovedMemberToMembersSheet(sheet, row);
    addProcessNote(sheet, row, `New member added at ${now.toISOString()}`);
    return;
  }
  // otherwise, not yet decided. Update status if necessary
  const newStatus = (votesFor.length > 0 || votesAgainst.length > 0) ? 'Awaiting Approval' : status;
  if (newStatus !== status) {
    sheet.getRange(row, CONFIG.colStatus).setValue(newStatus);
    sheet.getRange(row, CONFIG.colStatusUpdated).setValue(myDateTime);
    addProcessNote(sheet, row, `Status changed to ${newStatus} at ${now.toISOString()}`);
  }
}

function finalizeDecision(row, decision, reasonText) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  // set turnaround
  const timestamp = sheet.getRange(row, CONFIG.colTimestamp).getValue();
  if (timestamp) {
    const days = (now - new Date(timestamp)) / (1000*60*60*24);
    sheet.getRange(row, CONFIG.colTurnaroundTime).setValue(days);
  }

  // send email to applicant
  sendFinalApplicantEmail(sheet, row, decision);
  addProcessNote(sheet, row, `${decision} email sent to applicant at ${now.toISOString()}`);

  // Finalise all
  sheet.getRange(row, CONFIG.colStatus).setValue('Processed');
  sheet.getRange(row, CONFIG.colStatusUpdated).setValue(myDateTime);
  addProcessNote(sheet, row, `Application Process completed: ${decision} at ${now.toISOString()} Reason: ${reasonText}`);

  // invalidate outstanding tokens for this row
  invalidateTokensForRow(sheet.getRange(row, CONFIG.colRowID).getValue());
}

function initiateDeliberation(sheet, row) {
  console.log('In deliberation module');
  
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  // get rowID and cancel outstading vote tokens 
  const rowID = sheet.getRange(row,CONFIG.colRowID).getValue();
  invalidateTokensForRow(rowID);

  // send deliberation emails to voting committe members 
  sendDeliberationEmails(sheet, row);
  
  // remove previous votes FOR and AGAINST
  sheet.getRange(row,CONFIG.colVotesFor).setValue(null);
  sheet.getRange(row,CONFIG.colVotesAgainst).setValue(null);

  // update status to 'in deliberation'
  const newStatus = 'In Deliberation';
  sheet.getRange(row,CONFIG.colStatus).setValue(newStatus);
  
  updateReminderDate(row);

  // update process notes
  addProcessNote(sheet, row, `Status changed to ${newStatus} at ${myDateTime}`);
}



//======================================
// FILE: VotingForm.html
//======================================

<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0b1d3a 0%, #1a365d 50%, #0d253f 100%);
      background-attachment: fixed;
      color: #ffffff;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }

    body::before, body::after {
      content: '';
      position: fixed;
      border-radius: 50%;
      filter: blur(100px);
      z-index: -1;
      pointer-events: none;
    }

    body::before {
      width: 400px; 
      height: 400px;
      background: rgba(0, 198, 255, 0.3);
      top: 5%; 
      left: 10%;
    }

    body::after {
      width: 450px; 
      height: 450px;
      background: rgba(0, 114, 255, 0.25);
      bottom: 5%; 
      right: 10%;
    }

    .container { 
      width: 100%; 
      max-width: 700px; 
    }

    .logo {
      flex-shrink: 0;
      width: 80px; 
      height: 80px;
      object-fit: contain;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.35);
      box-shadow: 0 8px 24px rgba(2,12,24,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
      padding: 8px;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 30px;
    }

    .page-header h2 { 
      font-size: 1.7em; 
      font-weight: 800;
      letter-spacing: -0.02em; 
      color: #ffffff;
      text-shadow: 0 2px 12px rgba(0,0,0,0.25);
      margin: 0 0 6px;
    }

    .page-header p { 
      color: rgba(255, 255, 255, 0.8) !important;
      font-size: 0.85rem; 
      line-height: 1.3; 
      margin: 0;
    }

    .glass-section {
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.3);
      border-radius: 28px;
      padding: 30px;
      margin-bottom: 30px;
    }

    .info-card {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      padding: 16px 20px;
      border-radius: 18px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .info-card p { 
      font-size: 0.92rem; 
      color: rgba(255, 255, 255, 0.85); 
    }
    
    .info-card strong { 
      color: #00c6ff; 
      font-weight: 600;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      margin-bottom: 24px;
    }

    .form-group label {
      margin-bottom: 12px;
      font-size: 0.8rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.85) !important;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .radio-pill-group {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .radio-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 12px 24px;
      border-radius: 50px;
      cursor: pointer;
      user-select: none;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 0.95rem;
      font-weight: 500;
    }

    .radio-pill:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
      transform: translateY(-1px);
    }

    .radio-pill:has(input:checked) {
      background: rgba(0, 198, 255, 0.25);
      border-color: rgba(0, 198, 255, 0.7);
      box-shadow: 0 0 15px rgba(0, 198, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.4);
      color: #ffffff;
    }

    .radio-pill input[type="radio"] {
      width: 16px;
      height: 16px;
      accent-color: #00c6ff;
      cursor: pointer;
    }

    textarea { 
      color: #ffffff !important; 
      background: rgba(255, 255, 255, 0.12) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      border-radius: 20px !important;
      padding: 16px 20px !important; 
      font-size: 0.95rem;
      font-family: inherit;
      width: 100%;
      box-sizing: border-box;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: all 0.25s ease;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.15);
      outline: none;
      resize: vertical;
    }

    textarea:focus { 
      background-color: rgba(255, 255, 255, 0.2) !important;
      border-color: rgba(0, 198, 255, 0.6) !important;
      box-shadow: 0 0 18px rgba(0, 198, 255, 0.3), inset 0 1px 3px rgba(0,0,0,0.1);
    }

    textarea::placeholder {
      color: rgba(255, 255, 255, 0.45);
    }

    .btn-pill {
      background: linear-gradient(135deg, rgba(0, 198, 255, 0.85), rgba(0, 114, 255, 0.85));
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.4);
      padding: 16px 32px;
      font-size: 1rem;
      font-weight: 700;
      border-radius: 50px;
      cursor: pointer;
      width: 100%;
      letter-spacing: 0.5px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 8px 25px rgba(0, 114, 255, 0.35);
      margin-top: 10px;
    }

    .btn-pill:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0, 198, 255, 0.5);
      background: linear-gradient(135deg, rgba(0, 198, 255, 0.95), rgba(0, 114, 255, 0.95));
    }

    .btn-pill:active {
      transform: translateY(0);
    }

    .hidden { display: none !important; }

    #progressModal {
      position: fixed; 
      inset: 0;
      background: rgba(11, 29, 58, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex; 
      align-items: center; 
      justify-content: center;
      z-index: 9999;
    }

    .progress-card {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.25);
      padding: 35px 40px; 
      border-radius: 24px;
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.3);
      text-align: center;
    }

    .spinner {
      width: 42px; 
      height: 42px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: #00c6ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 18px auto;
    }

    @keyframes spin { 
      to { transform: rotate(360deg); } 
    }

    .status-alert {
      margin-top: 20px;
      padding: 18px 24px;
      border-radius: 20px;
      font-size: 0.95rem;
      font-weight: 600;
      text-align: center;
      background: rgba(0, 230, 118, 0.2);
      border: 1px solid rgba(0, 230, 118, 0.5);
      color: #00e676;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    @media (max-width: 640px) {
      .page-header { 
        flex-direction: column; 
        text-align: center; 
      }
      .radio-pill-group {
        flex-direction: column;
      }
      .radio-pill {
        width: 100%;
      }
    }
  </style>
</head>

<body>

  <div id="progressModal" class="hidden">
    <div class="progress-card">
      <div class="spinner"></div>
      <div style="font-size: 1.1rem; font-weight: 600; color: #ffffff;">Recording Your Vote...</div>
    </div>
  </div>

  <div class="container">
    <div class="page-header">
      <img class="logo" src="https://lh3.googleusercontent.com/d/1jy49r9b2qUZbDY31PIhJPE2QmFngPRNg=w200?authuser=0" alt="Logo">
      <div>
        <h2>Committee Ballot Form</h2>
        <p>Sydney Maritime Modellers Club - Official Membership Voting</p>
      </div>
    </div>

    <div class="glass-section">
      <div class="info-card">
        <p>Applicant / Motion: <strong><?= applicantName ?></strong></p>
        <p>Committee Member: <strong><?= committeeMember ?></strong></p>
      </div>

      <form id="votingForm">
        <input type="hidden" name="token" value="<?= token ?>">

        <div class="form-group">
          <label>Cast Your Vote</label>
          <div class="radio-pill-group">
            <label class="radio-pill">
              <input type="radio" name="voteDecision" value="Approve" required>
              <span>Approve Application</span>
            </label>
            <label class="radio-pill">
              <input type="radio" name="voteDecision" value="Reject">
              <span>Reject Application</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="voteComments">Rejection Reason</label>
          <textarea id="voteComments" name="voteComments" rows="3" placeholder="Reason for application rejection..."></textarea>
        </div>

        <button type="submit" class="btn-pill">Submit Official Vote</button>
      </form>

      <div id="statusAlert" class="hidden status-alert"></div>
    </div>
  </div>

  <script>
    document.getElementById('votingForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const modal = document.getElementById('progressModal');
      modal.classList.remove('hidden');

      const params = {
        token: this.token.value,
        vote: this.querySelector('input[name="voteDecision"]:checked').value,
        rejectionReason: this.voteComments.value.trim()
      };

      google.script.run
        .withSuccessHandler(function(response) {
          modal.classList.add('hidden');
          document.getElementById('votingForm').style.display = 'none';
          const alert = document.getElementById('statusAlert');
          alert.textContent = response;
          alert.classList.remove('hidden');
        })
        .withFailureHandler(function(error) {
          modal.classList.add('hidden');
          alert('System Error: ' + error);
        })
        .handleVote(params);
    });
  </script>

</body>
</html>

//======================================
// FILE: NewMember.gs
//======================================

/**
 * Adds an approved member to the Members sheet in the Club Management workbook.
 * This is called once an application is marked as Approved.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} appSheet - MembershipApplications sheet
 * @param {number} row - row index of the approved applicant
 */
function addApprovedMemberToMembersSheet(appSheet, row) {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const membersSheet = ss.getSheetByName('Members');
  if (!membersSheet) throw new Error('"Members" sheet not found in Club Management workbook.');

  // Read application data
  const firstName = appSheet.getRange(row, CONFIG.colFirstName).getValue();   
  const surname = appSheet.getRange(row, CONFIG.colSurname).getValue();     
  const email = appSheet.getRange(row, CONFIG.colEmail).getValue();       
  const phone = appSheet.getRange(row, CONFIG.colPhone).getValue();      
  var membershipType = appSheet.getRange(row, CONFIG.colMembershipType).getValue(); 
  const address = appSheet.getRange(row,CONFIG.colAddress).getValue();
  const city = appSheet.getRange(row,CONFIG.colCity).getValue(); 
  const pCode = appSheet.getRange(row,CONFIG.colPCode).getValue();
  const eContact = appSheet.getRange(row, CONFIG.colEContact).getValue();
  const eNumber = appSheet.getRange(row, CONFIG.colEContactPh).getValue();
  const approvedDate = new Date();

  // Format name
  const fullName = `${firstName} ${surname}`.trim();

  // Shorten Memberhip type
  if(membershipType === 'Full Membership') {
    membershipType = 'Full';
  } else {
    membershipType = 'Affiliate';
  }

  // Determine the next available Member Number (Column A)
  const lastRow = membersSheet.getLastRow();
  let nextMemberNo = 1;
  if (lastRow >= 2) {
    nextMemberNo = lastRow - 1;
  }

  // Calculate end of financial year (June 30)
  const year = approvedDate.getMonth() >= 6
    ? approvedDate.getFullYear() + 1
    : approvedDate.getFullYear();
  const endOfFY = new Date(year, 6, 30);  // 30 June

  // Prepare record according to sheet structure
  const rowData = [
    nextMemberNo,     // Member No
    ,                 // Active
    fullName,         // MemberName
    membershipType,   // Membership
    approvedDate,     // Start Date
    endOfFY,          // End Date
    false,            // Paid Up (checkbox empty)
    phone,            // Phone
    email,            // Email
    false,            // WhatsApp (checkbox empty)
    ,                 // Duplicate (formula will populate itself)
    address,          // address line
    city,             // City
    pCode,            // post code
    eContact,         // Emergency Contact
    eNumber           // Emergency Number
  ];

  membersSheet.appendRow(rowData);

  // Apply date formats for clarity
  const newRow = membersSheet.getLastRow();
  membersSheet.getRange(newRow, 5).setNumberFormat("yyyy-MM-dd");
  membersSheet.getRange(newRow, 6).setNumberFormat("yyyy-MM-dd");

  // Notify Treasurer
  //notifyTreasurerOfNewMember({
  //  number: nextMemberNo,
  //  name: fullName,
  //  membership: membershipType,
  //  startDate: approvedDate,
  //  endDate: endOfFY,
  //  phone: phone,
  //  email: email
  //});
}

/**
 * Sends the Treasurer an email to watch for incoming payment for a newly approved member.
 *
 * @param {Object} member - Object containing member data:
 *   { number, name, membership, startDate, endDate, phone, email }
 */
function notifyTreasurerOfNewMember(member) {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const committeeSheet = ss.getSheetByName('Committee');
  if (!committeeSheet) throw new Error('"Committee" sheet not found.');

  const data = committeeSheet.getDataRange().getValues();
  const header = data[1];   // headers are in ROW 2
  const roleCol = header.indexOf('Role');
  const emailCol = header.indexOf('Email');

  if (roleCol < 0 || emailCol < 0) throw new Error('Committee sheet headers missing.');

  // Find Treasurer row
  const treasurerRow = data.find((row, idx) =>
    idx > 1 && String(row[roleCol]).trim().toLowerCase() === 'treasurer'
  );

  if (!treasurerRow) return; // No Treasurer found — silently skip

  const treasurerEmail = treasurerRow[emailCol];
  if (!treasurerEmail) return;

  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 14); // Tokens expire in 14 days
  const type = 'markPaid'
  
  const paymentToken = generateToken(type, member.email, member.number,'', expiry);
  const webappUrl = CONFIG.webAppURL;
  const markPaidLink = `${webappUrl}?action='markPaid'&token=${paymentToken}`;

  const subject = `New Member Payment Expected – ${member.name}`;
  const textBody =
    `Dear Treasurer,\n\n` +
    `A new member has been approved and added to the Members database.\n\n` +
    `Please watch for membership payment from:\n\n` +
    `Member No: ${member.number}\n` +
    `Name: ${member.name}\n` +
    `Membership Type: ${member.membership}\n` +
    `Email: ${member.email}\n` +
    `Phone: ${member.phone}\n` +
    `Start Date: ${formatDate(member.startDate)}\n` +
    `End Date: ${formatDate(member.endDate)}\n\n` +
    `Mark Member as Paid: ${markPaidLink}\n\n` +
    `Best regards,\nSMMC Admin AutoBot`;

  const htmlBody =
    `<p>Dear Treasurer,</p>` +
    `<p>A new member has been <strong>approved</strong> and added to the Members database.</p>` +
    `<ul>` +
    `<li><strong>Member No:</strong> ${member.number}</li>` +
    `<li><strong>Name:</strong> ${member.name}</li>` +
    `<li><strong>Membership Type:</strong> ${member.membership}</li>` +
    `<li><strong>Email:</strong> ${member.email}</li>` +
    `<li><strong>Phone:</strong> ${member.phone}</li>` +
    `<li><strong>Start Date:</strong> ${formatDate(member.startDate)}</li>` +
    `<li><strong>End Date:</strong> ${formatDate(member.endDate)}</li>` +
    `</ul>` +
    `<p>Please keep an eye out for their membership payment.</p>` +
    `<p><a href="${markPaidLink}" 
      style="padding:10px 16px; background:#2c7; color:white; 
      text-decoration:none; border-radius:6px;">
      Mark Member as Paid
     </a></p>` +
    `<p>Best regards,<br>SMMC Admin AutoBot</p>`;
  MailApp.sendEmail({to: treasurerEmail, subject: subject, body: textBody, htmlBody: htmlBody});

}

function markMemberAsPaid(memberNo) {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const membersSheet = ss.getSheetByName('Members');

  const data = membersSheet.getDataRange().getValues();
  const header = data[1];
  const memberCol = 0; // Column A
  const paidUpCol = header.indexOf('Paid up');

  for (let i = 2; i < data.length; i++) {
    if (Number(data[i][memberCol]) === memberNo) {
      membersSheet.getRange(i+1, paidUpCol+1).setValue(true);

      // Return for success
      return {
        number: memberNo,
        name: data[i][2]
      };
    }
  }

  return null;
}

//======================================
// FILE: Reminder.gs
//======================================

function checkReminderAndSendEmail() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.membershipSheetName);
  const applicationLink = CONFIG.appLink;
  const currentDate = new Date();
  const rows = sheet.getDataRange().getValues();
  const committeeEmails = getCommitteeEmails(3, 5); // General Committee Emails for Reminder

  for (let [i, row] of rows.slice(7).entries()) {
    const rowIndex = i + 8; // Row index in the sheet (1-based)
    const status = row[CONFIG.colStatus - 1];
    const timestamp = row[CONFIG.colTimestamp - 1]; // Column C (Timestamp)
    
    if (!timestamp || status === 'Processed') continue;

    const nominationDate = row[CONFIG.colNominationDate - 1];
    const seconderNominationDate = row[CONFIG.colSeconderDate - 1];
    const applicantName = `${row[CONFIG.colFirstName -1 ]} ${row[CONFIG.colSurname - 1]}`; // Name (E) and Surname (F)
    const reminderDate = row[CONFIG.colReminderDate - 1];
    
    // 1. Check if Nomination/Seconder responses received and update status
    if (nominationDate && seconderNominationDate && status !== "Awaiting Approval") {
      sheet.getRange(rowIndex, CONFIG.colStatus).setValue("Awaiting Approval");
      if (committeeEmails.length && applicantName) sendAwaitingApprovalEmail(committeeEmails, timestamp, applicantName, applicationLink, rowIndex);
    }

    // 2. Check for reminder email
    if (reminderDate <= currentDate && status !== 'Processed') {
      if (committeeEmails.length && applicantName) sendReminderEmail(committeeEmails, timestamp, applicantName, applicationLink, sheet, rowIndex);
    }
  }
}

/**
 * Sends a reminder email and updates the reminder date.
 */
function sendReminderEmail(committeeEmails, timestamp, applicantName, applicationLink, sheet, rowIndex) {
  if (!applicantName || !applicationLink) return;
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
  const appLink = CONFIG.webAppURL + `?token=${rowIndex}`;
  const plainTextBody = `Dear Committee Member,
This is a notification that an application has not been progressed in the last 2 days.
Please review and update at your earliest convenience:
Applicant: ${applicantName}
Timestamp: ${formattedTimestamp}
You can view the membership application here:
${appLink}
Best regards,
SMMC Admin AI`;

  const htmlBody = `<p>Dear Committee Member,</p>
<p>This is a notification that an application has not been progressed in the last 2 days.</p>
<ul><li>Applicant: ${applicantName}</li><li>Timestamp: ${formattedTimestamp}</li></ul>
<p>You can view the membership application here:<br><br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Google Drive sheet</span></a></p>
<p>Best regards,<br>SMMC Admin AI</p>`;

  MailApp.sendEmail({to: committeeEmails.join(','), subject: "Reminder: Application Pending Progress", body: plainTextBody, htmlBody: htmlBody});
  
  // Update Reminder Date (T) after sending
  updateReminderDate(rowIndex);
  
  // Update Processed Notes (V)
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  addProcessNote(sheet, rowIndex, `Reminder email sent and Reminder date updated at:${myDateTime}`);
}

/**
 * Sends a general notification email that the application is ready for approval.
 * (This is separate from the secure voting request in Responses.gs).
 */
function sendAwaitingApprovalEmail(committeeEmails, timestamp, applicantName, applicationLink, rowIndex) {
  if (!applicantName || !applicationLink) return;
  const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
  const appLink = CONFIG.webAppURL + `?token=${rowIndex}`;
  const plainTextBody = `Dear Committee Member,
This is a notification that an application has been processed and is ready for committee review.
Please check the sheet and await the secure voting link email.
Applicant: ${applicantName}
Timestamp: ${formattedTimestamp}
You can view the membership application here:
${appLink}
Best regards,
SMMC Admin AI`;
  
  const emailBody = `<p>Dear Committee Member,</p>
<p>This is a notification that an application has been processed and is ready for committee review.</p>
<p>Please check the sheet and await the secure voting link email.</p>
<ul><li>Applicant: ${applicantName}</li><li>Timestamp: ${formattedTimestamp}</li></ul>
<p>You can view the membership application here:<br><br>
<a href="${appLink}" target="_blank" style="text-decoration: none; color: #000;">
<img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" alt="Open Sheet" width="32" height="32" style="vertical-align:middle; margin-right: 8px;">
<span style="font-size: 14px; vertical-align:middle;">Open the Google Drive sheet</span></a></p>
<p>Best regards,<br>SMMC Admin AI</p>`;
  
  MailApp.sendEmail({to: committeeEmails.join(','), subject: "New Application Ready for Review", body: plainTextBody, htmlBody: emailBody});
}



//======================================
// FILE: helpers.gs
//======================================

function updateReminderDate(row) {
  const ss = SpreadsheetApp.openByUrl(CONFIG.appLink);
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + 2);
  sheet.getRange(row, CONFIG.colReminderDate).setValue(Utilities.formatDate(reminderDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
  sheet.getRange(row, CONFIG.colStatusUpdated).setValue(new Date());

}

function addProcessNote(sheet, row, note){
  let noteRange = sheet.getRange(row, CONFIG.colProcessedNotes);
  let newNote = noteRange.getValue() + note + '\n';
  noteRange.setValue(newNote);
  console.log("Note Added: " + note + " to row: " + row);
}


// Updated getCommitteeEmails to optionally return names
function getCommitteeEmails(emailColumn, sendMailColumn, returnNames = false) {
  const committeeSpreadsheet = SpreadsheetApp.openById(CONFIG.masterDataID);
  const committeeSheet = committeeSpreadsheet.getSheetByName("Committee");
  const lastRow = committeeSheet.getLastRow();
  
  if (lastRow < 2) return [];

  const emailData = committeeSheet.getRange(2, emailColumn, lastRow - 1, 1).getValues();
  const sendMailData = committeeSheet.getRange(2, sendMailColumn, lastRow - 1, 1).getValues();
  
  let nameData = [];
  if (returnNames) {
    // Assuming Column 2 (B) is the Committee Member Name in the Committee Sheet
    nameData = committeeSheet.getRange(2, 2, lastRow - 1, 1).getValues(); 
  }
  
  const results = [];
  emailData.forEach((emailRow, index) => {
    const email = emailRow[0];
    const sendMail = sendMailData[index][0];
    if (sendMail === true && email) {
        if (returnNames) {
            results.push(nameData[index][0] || email); // Use name, or email as fallback
        } else {
            results.push(email);
        }
    }
  });
  return results;
}


function getCommittee() {
  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const sh = ss.getSheetByName('Committee');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  return data.slice(2).map(row => ({
    role: row[0],
    member: row[1],
    email: row[2],
    phone: row[3],
    notifyApplication: row[4],
    approveApplication: row[5]
  }));
}

function getApprovingCommitteeMembers() {
  const committee = getCommittee();
  return committee.filter(r => r.approveApplication === true);
}

function getNotificationCommitteeMembers() {
  const committee = getCommittee();
  return committee.filter(r => r.notifyApplication === true);
}

/**
 * Fetches active club member names from the Master sheet to populate nominators/seconders.
 */
function getMembersList() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
    const membersSheet = ss.getSheetByName("Members");
    if (!membersSheet) return [];
    
    const lastRow = membersSheet.getLastRow();
    if (lastRow < 2) return [];

    // Column C (index 3) contains full member names
    const data = membersSheet.getRange(2, 3, lastRow - 1, 1).getValues();
    const members = data
      .map(row => row[0] ? row[0].toString().trim() : '')
      .filter(name => name.length > 0)
      .sort();

    return Array.from(new Set(members));
  } catch (err) {
    console.log("Error getting members list: " + err.toString());
    return [];
  }
}



function getMemberByNumber(memberNo) {
  if (!memberNo) return null;

  const ss = SpreadsheetApp.openById(CONFIG.masterDataID);
  const sh = ss.getSheetByName('Members');

  if (!sh) throw new Error('Members sheet not found');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const currentMemberNo = row[0];

    if (String(currentMemberNo) === String(memberNo)) {
      return {
        rowNumber: i + 2,
        memberNo: row[0],
        active: row[1],
        name: row[2],
        membership: row[3],
        startDate: row[4],
        endDate: row[5],
        paidUp: row[6],
        phone: row[7],
        email: row[8],
        whatsapp: row[9],
        duplicate: row[10]
      };
    }
  }

  return null;
}



function renderMarkPaidPage(info) {
  if (!info || !info.memberNo) {
    return HtmlService.createHtmlOutput(
      '<h3>Invalid request</h3><p>Member number was not supplied.</p>'
    );
  }

  let member;
  try {
    member = getMemberByNumber(info.memberNo);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      `<h3>Error</h3><p>${err.message}</p>`
    );
  }

  if (!member) {
    return HtmlService.createHtmlOutput(
      `<h3>Member not found</h3><p>No member exists with number ${info.memberNo}.</p>`
    );
  }

  try {
    markMemberAsPaid(info.memberNo);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      `<h3>Payment error</h3><p>${err.message}</p>`
    );
  }

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px">
      <h2>Payment Recorded</h2>
      <p>Thank you. The membership payment has been successfully recorded.</p>
      <p><strong>Member:</strong> ${member.name || member.fullName || ''}</p>
      <p><strong>Member Number:</strong> ${info.memberNo}</p>
    </div>
  `;

  return HtmlService.createHtmlOutput(html)
    .setTitle('Payment Recorded');
}




//======================================
// FILE: nominationHelpers.gs
//======================================

function renderNominationForm(tokenInfo) {
  console.log("In render nomination form");
  // 1. Create the template from the file
  var template = HtmlService.createTemplateFromFile('NominatingForm'); 

  // 2. MAP THE DATA
  // In the token: 'param' Applicant's Name
  // In the token: 'email' Committee Member's Name (or email)
  
  template.applicantName = tokenInfo.applicantName;   
  template.committeeMember = tokenInfo.committeeMember;
  template.applicantRowID = tokenInfo.applicantRowID; 
  template.token = tokenInfo.tokenString;
  
  // Get committee members name from token sheet
  const result = validateToken(template.token);
  template.committeeMember = result.cName;
 
 console.log("Committee name: " + template.committeeMember)

  // 3. Return the evaluated HTML
  return template.evaluate()
      .setTitle('SMMC Membership Nomination')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleNomination(params) {
  console.log("In handleNominations - decision: " + params.agree + " comments: " + params.comments);

  // 1. Security Check: Validate Token
  const result = validateToken(params.token);

  if (!result.valid) {
    return `Error: This voting link is already used or invalid - ${result.reason}`;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);

  const role = (result.type === 'Nominating') ? 'Nominator' : 'Seconder';
  const rowId = result.rowId;
  const member = result.cName;
  const row = result.row;
  const agree = (params.agree || '').toLowerCase();
  const comments = params.comments || '';

  console.log('role: ' + role + ' member: ' + member);

  const tsColumnIndex = (result.type === 'Nominating') ? CONFIG.colNominationDate : CONFIG.colSeconderDate;  

  if (!rowId || !member || !agree || !row || !result.type) {
    return 'Missing parameters - require rowId, member, vote and row';
  }
  console.log("agree: " + agree + " member: " + member + " rowId: " + rowId + " row: " + row + " type: " + result.type);

  // ----------------------------------------------------------------------
  // Update timestamp in Column P or Q
  // ----------------------------------------------------------------------
  const now = new Date();
  const myDateTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  sheet.getRange(row, tsColumnIndex).setValue(myDateTime);

  // ----------------------------------------------------------------------
  // Update Comments
  // ----------------------------------------------------------------------
  const commentsCell = sheet.getRange(row, CONFIG.colComments);
  const existingRich = commentsCell.getRichTextValue();

  // Build formatted comment line
  // Role in **bold** is done using RichText formatting

  const newLine = `${role}: ${comments}`;

  let combinedText = '';
  if (existingRich) {
    combinedText = existingRich.getText() + '\n' + newLine;
  } else {
    combinedText = newLine;
  }

  const builder = SpreadsheetApp
    .newRichTextValue()
    .setText(combinedText);

  const roleRegex = /(Nominator|Seconder):/g;
  let match;

  while ((match = roleRegex.exec(combinedText)) !== null) {
    const start = match.index;
    const end = start + match[0].length - 1; // inclusive
    builder.setTextStyle(start, end, SpreadsheetApp.newTextStyle().setBold(true).build());

  }
  commentsCell.setRichTextValue(builder.build());
  // ----------------------------------------------------------------------

  if (agree === 'yes') {
    addProcessNote(sheet, row, `Nomination agreed to by ${member}, comments added.`);
  } else {
    addProcessNote(sheet, row, `${member} disagreed to support the nomination, comments added.`);
  }
  
  // --- CALL THE NECESSARY PROCESSING LOGIC HERE ---
  console.log("Update Nomination Sheet");
  const status = updateNominationStatus(sheet, row);

  // 1. Check for final approval if the comments edit might finalize a row
  if (status === 'Awaiting Approval') {
      console.log('check For Final Approval');
      checkForFinalApproval(sheet, row); 
  }

  // Update Reminder Date
  updateReminderDate(row);

  return `Thank you, ${member}. Your decision, Support the nomination - '${agree}', has been recorded.`;
}

//======================================
// FILE: votingHelpers.gs
//======================================

function renderVotingForm(tokenInfo) {
  // 1. Create the template from the file
  var template = HtmlService.createTemplateFromFile('VotingForm'); // or whatever your file is named

  template.applicantName = tokenInfo.applicantName;   

  template.applicantRowID = tokenInfo.applicantRowID; 
  template.token = tokenInfo.tokenString;

  const result = validateToken(template.token);
  template.committeeMember = result.cName;
 
  // 3. Return the evaluated HTML
  return template.evaluate()
      .setTitle('SMMC Membership Vote')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function generateToken(type, identifier, param, row, expiry) {
  const raw = type + '|' + identifier + '|' + param + '|' + row + '|' + expiry;
  const signature = Utilities.computeHmacSha256Signature(raw, "SMMCTokens");
  const encodedSig = signature.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  
  const token = Utilities.base64EncodeWebSafe(raw + '|' + encodedSig);
  return token; 
}

function verifyToken(token) {
  try {
    if (!token) return null;
    
    const webSafeToken = token.replace(/\+/g, '-').replace(/\//g, '_');    
    const decodedBytes = Utilities.base64DecodeWebSafe(webSafeToken);
    
    // CRITICAL CHANGE: This is how you correctly convert bytes back to text
    const text = Utilities.newBlob(decodedBytes).getDataAsString();
    
    const parts = text.split('|');
    if (parts.length !== 6) {
      Logger.log("Split failed. Parts count: " + parts.length);
      return null;
    }

    const [type, email, param, rowId, timestamp, sig] = parts;
    const raw = type + '|' + email + '|' + param + '|' + rowId + '|' +  timestamp;
    
    const expected = Utilities.computeHmacSha256Signature(raw, "SMMCTokens");
    const expectedHex = expected.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');

    if (expectedHex !== sig) {
      Logger.log("Signature mismatch!");
      return null;
    }
    const committeeMember = email;
    const applicantname = param;
    const applicantRowID = rowId;
    return { 
      valid: true, 
      tokenString: token,
      type: type,
      committeeMember: committeeMember,
      applicantName: applicantname,
      applicantRowID: applicantRowID,
      timestamp: timestamp
    };
  } catch (err) {
    Logger.log("Verify Error: " + err);
    return null;
  }
}

function validateToken(token) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tokensSheet = ss.getSheetByName(CONFIG.tokensSheetName);
  if (!tokensSheet) return {valid:false, reason:'Token store missing.'};
  const data = tokensSheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    const rowToken = data[r][0];
    const type = data[r][1];
    const committeeName = data[r][2];
    const rowId = data[r][3];
    const used = data[r][4];
    const expiry = data[r][5];
    if (rowToken === token) {
      if (used === true || used === 'TRUE')        return {valid:false, reason:'This link has already been used.'};
      if (expiry && new Date(expiry) < new Date()) return {valid:false, reason:'This link has expired.'};
      
      // ensure application not processed
      const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
      const row = findRowByRowId(sheet, rowId);
      if (!row) return {valid:false, reason:'Application not found.'};

      const status = sheet.getRange(row, CONFIG.colStatus).getValue();
      if (status === 'Processed') return {valid:false, reason:'Application has already been processed.'};
      return {valid:true, rowId: rowId, cName: committeeName, row: row, type: type};
    }
  }
  return {valid:false, reason:'Invalid token.'};
}

function findRowByRowId(sheet, rowId) {
  console.log("In findRowbyRowId: " + rowId);
  const data = sheet.getRange(CONFIG.dataStartRow, CONFIG.colRowID, sheet.getLastRow()-CONFIG.dataStartRow+1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    console.log("data: " + data[i][0] + " rowid: " + rowId + " i: " + i);
    if (data[i][0] === rowId) return i + CONFIG.dataStartRow;
  }
  return null;
}


function handleVote(params) {
  
  // 1. Security Check: Validate Token
  const result = validateToken(params.token);

  if (!result.valid) {
    return `Error: This voting link is invalid - ${result.reason}`;
  }
  
  const rowId = result.rowId;
  const member = result.cName;
  const row = result.row;
  const type = result.type;
  const vote = (params.vote || '').toLowerCase();
  const reason = params.rejectionReason || '';

  if (!rowId || !member || !vote || !row) {
    return 'Missing parameters - require rowId, member, vote and row';
  }
  console.log("vote: " + vote + " member: " + member + " rowId: " + rowId + " row: " + row);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Membership Applications');

  // Update Reminder Date
  updateReminderDate(row);

  // Update lists
  let votesFor = (sheet.getRange(row, CONFIG.colVotesFor).getValue() || '').toString();
  let votesAgainst = (sheet.getRange(row, CONFIG.colVotesAgainst).getValue() || '').toString();

  // Clean lists to prevent duplicates
  votesFor     = removeNameFromList(votesFor, member);
  votesAgainst = removeNameFromList(votesAgainst, member, true);

  console.log("vote: " + vote + " member: " + member + " votesFor: " + votesFor);

  if (vote === 'approve') {
    votesFor = addNameToList(votesFor, member);
    sheet.getRange(row, CONFIG.colVotesFor).setValue(votesFor);
    addProcessNote(sheet, row, `Vote FOR by ${member}`);
  } else if (vote === 'reject') {
    votesAgainst = addNameToList(votesAgainst, member);
    sheet.getRange(row, CONFIG.colRejectionReason).setValue(reason);
    sheet.getRange(row, CONFIG.colVotesAgainst).setValue(votesAgainst);
    addProcessNote(sheet, row, `Vote AGAINST by ${member} - ${reason}`);
    initiateDeliberation(sheet, row);
  } else {
    console.log("no valid vote value received: " + vote);
  }

  // Run your finalization check
  checkForFinalApproval(sheet, row);

  // 2. Security: mark token so they can't vote again
  markTokenUsed(params.token);

  return `Thank you, ${member}. Your vote of '${vote}' has been recorded.`;
}



function removeNameFromList(listText, memberName, againstStyle) {
  if (!listText) return '';
  const items = listText.split(',').map(i => i.trim()).filter(Boolean);
  const filtered = items.filter(it => {
    if (againstStyle) {
      // against entries may be "Name: reason" or "Name"
      const namePart = it.split(':')[0].trim();
      return namePart.toLowerCase() !== memberName.toLowerCase();
    } else {
      return it.toLowerCase() !== memberName.toLowerCase();
    }
  });
  return filtered.join(', ');
}


function appendVote(sheet, rowNumber, col, text) {
  const existing = sheet.getRange(rowNumber, col).getValue();
  let list = parseList(existing);
  // avoid duplicates
  if (!list.includes(text)) list.push(text);
  sheet.getRange(rowNumber, col).setValue(list.join(', '));
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.toString().split(',').map(s => s.trim()).filter(s=>s.length>0);
}

function addNameToList(listText, name) {
  const items = listText ? listText.split(',').map(i => i.trim()).filter(Boolean) : [];
  // Prevent duplicates
  const lower = items.map(i => i.toLowerCase());
  if (lower.indexOf(name.toLowerCase()) === -1) {
    items.push(name);
  }
  return items.join(', ');
}



function markTokenUsed(token) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tokensSheet = ss.getSheetByName(CONFIG.tokensSheetName);
  if (!tokensSheet) return;
  const data = tokensSheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === token) {
      tokensSheet.getRange(r+1, 5).setValue(true);
      return;
    }
  }
}

function invalidateTokensForRow(rowId){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tokensSheet = ss.getSheetByName(CONFIG.tokensSheetName);
  if (!tokensSheet) return;
  const data = tokensSheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][3] === rowId) {
      tokensSheet.getRange(r+1, 5).setValue(true);
    }
  }
}


//======================================
// FILE: displayApplication.gs
//======================================

function displayApplication(row) {
  console.log("In Display Application: " + row);
  var dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Membership Applications');
  var data = dataSheet.getRange(row, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  
  if (!data) return HtmlService.createHtmlOutput("Application not found.");

  var lastUpdated = new Date(data[27]);
  var today = new Date();
  var diffInTime = today.getTime() - lastUpdated.getTime();
  var diffInDays = diffInTime / (1000 * 3600 * 24);

  var isUrgent = diffInDays >= 2;
  var statusClass = isUrgent ? 'status-urgent' : 'status-normal';

  var signed = data[19] > "";
  var disclaimer = signed ? "Yes" : "No";

  // Parse combined string in data[24] into separate nominator and seconder comments
  var rawComments = String(data[24] || "");
  var nomMatch = rawComments.match(/Nominator:\s*([\s\S]*?)(?=Seconder:|$)/i);
  var secMatch = rawComments.match(/Seconder:\s*([\s\S]*)/i);

  var nominatorComment = nomMatch ? nomMatch[1].trim() : rawComments;
  var seconderComment = secMatch ? secMatch[1].trim() : "";

  var appDetails = {
    rowId: row,
    status: data[1],
    timestamp: data[2],
    email: data[3],
    fullName: data[4] + " " + data[5],
    address: data[6] + ", " + data[20] + ", " + data[7],
    phone: data[8],
    emergency: data[9] + " (" + data[10] + ")",
    type: data[11],
    currentClub: data[12],
    nominator: data[13],
    seconder: data[14],
    nominatorComment: nominatorComment,
    seconderComment: seconderComment,
    rejectionReason: data[18],
    disclaimer: disclaimer,
    votesFor: data[25],
    votesAgainst: data[26],
    log: data[23],
    statusClass: statusClass,
    lastUpdatedStr: lastUpdated.toLocaleDateString()
  };

  var tmp = HtmlService.createTemplateFromFile('detailView');
  tmp.details = appDetails;
  
  return tmp.evaluate()
    .setTitle("Membership Application: " + appDetails.fullName)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


//======================================
// FILE: detailView.html
//======================================

<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0b1d3a 0%, #1a365d 50%, #0d253f 100%);
      background-attachment: fixed;
      color: #ffffff;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }

    body::before, body::after {
      content: '';
      position: fixed;
      border-radius: 50%;
      filter: blur(100px);
      z-index: -1;
      pointer-events: none;
    }

    body::before {
      width: 400px;
      height: 400px;
      background: rgba(0, 198, 255, 0.3);
      top: 5%;
      left: 10%;
    }

    body::after {
      width: 450px;
      height: 450px;
      background: rgba(0, 114, 255, 0.25);
      bottom: 5%;
      right: 10%;
    }

    .container {
      width: 100%;
      max-width: 850px;
    }

    .logo {
      flex-shrink: 0;
      width: 80px;
      height: 80px;
      object-fit: contain;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.35);
      box-shadow: 0 8px 24px rgba(2,12,24,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
      padding: 8px;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 30px;
    }

    .header-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .page-header h1 { 
      font-size: 1.8em;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
      text-shadow: 0 2px 12px rgba(0,0,0,0.25);
      margin: 0;
    }

    .glass-section {
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.3);
      border-radius: 28px;
      padding: 30px;
      margin-bottom: 25px;
    }

    .section-title { 
      color: #00c6ff !important; 
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      padding-bottom: 10px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      .page-header { flex-direction: column; text-align: center; }
    }

    .full-width { grid-column: 1 / -1; }

    .item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .label { 
      font-weight: 600; 
      color: rgba(255, 255, 255, 0.7); 
      font-size: 0.78rem; 
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .value { 
      font-size: 1rem; 
      color: #ffffff;
      font-weight: 500;
      word-break: break-word;
    }

    .badge { 
      display: inline-flex; 
      align-items: center;
      padding: 8px 18px; 
      border-radius: 50px; 
      font-weight: 600; 
      font-size: 0.88rem; 
      width: fit-content;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .status-normal { 
      background: rgba(0, 230, 118, 0.2); 
      border: 1px solid rgba(0, 230, 118, 0.5); 
      color: #00e676; 
    }

    .status-urgent { 
      background: rgba(255, 82, 82, 0.2); 
      border: 1px solid rgba(255, 82, 82, 0.5); 
      color: #ff5252; 
    }

    .urgent-note {
      margin-left: 10px; 
      font-size: 0.8rem; 
      border-left: 1px solid rgba(255, 82, 82, 0.5); 
      padding-left: 10px;
      color: rgba(255, 255, 255, 0.9);
    }

    .log-box {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 16px;
      font-family: monospace;
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.85);
      white-space: pre-wrap;
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="page-header">
      <img class="logo" src="https://lh3.googleusercontent.com/d/1jy49r9b2qUZbDY31PIhJPE2QmFngPRNg=w200?authuser=0" alt="Logo">
      <div class="header-content">
        <h1>Membership Application</h1>
        <div class="badge <?= details.statusClass ?>">
          Status: <?= details.status ?>          
          <? if (details.statusClass === 'status-urgent') { ?>
            <span class="urgent-note">
              ⚠️ Requires attention, last updated: <?= details.lastUpdatedStr ?>
            </span>
          <? } ?>
        </div>
      </div>
    </div>

    <div class="glass-section">
      <div class="section-title">Personal Information</div>
      <div class="grid">
        <div class="item"><div class="label">Name</div><div class="value"><?= details.fullName ?></div></div>
        <div class="item"><div class="label">Email</div><div class="value"><?= details.email ?></div></div>
        <div class="item"><div class="label">Phone</div><div class="value"><?= details.phone ?></div></div>
        <div class="item"><div class="label">Address</div><div class="value"><?= details.address ?></div></div>
        <div class="item full-width"><div class="label">Emergency Contact</div><div class="value"><?= details.emergency ?></div></div>
      </div>
    </div>

    <div class="glass-section">
      <div class="section-title">Club Details</div>
      <div class="grid">
        <div class="item"><div class="label">Membership Type</div><div class="value"><?= details.type ?></div></div>
        <div class="item"><div class="label">Current Club</div><div class="value"><?= details.currentClub ?></div></div>
      </div>
    </div>

    <div class="glass-section">
      <div class="section-title">Governance & Votes</div>
      <div class="grid">
        <div class="item full-width"><div class="label">Disclaimer Signed</div><div class="value"><?= details.disclaimer ?></div></div>
        
        <!-- Nominator & Seconder Names -->
        <div class="item"><div class="label">Nominator</div><div class="value"><?= details.nominator ?></div></div>
        <div class="item"><div class="label">Seconder</div><div class="value"><?= details.seconder ?></div></div>
        
        <!-- Nominator & Seconder Comments directly underneath -->
        <div class="item"><div class="label">Nominator Comment</div><div class="value"><?= details.nominatorComment ?></div></div>
        <div class="item"><div class="label">Seconder Comment</div><div class="value"><?= details.seconderComment ?></div></div>
        
        <div class="item"><div class="label">Votes For</div><div class="value" style="color:#00e676; font-weight:700;"><?= details.votesFor ?></div></div>
        <div class="item"><div class="label">Votes Against</div><div class="value" style="color:#ff5252; font-weight:700;"><?= details.votesAgainst ?></div></div>
        <div class="item full-width"><div class="label">Rejection Reason</div><div class="value"><?= details.rejectionReason ?></div></div>
      </div>
    </div>

    <div class="glass-section">
      <div class="section-title">Activity Log</div>
      <div class="log-box"><?= details.log ?></div>
    </div>
  </div>

</body>
</html>

//======================================
// FILE: utils.gs
//======================================


/**
 * Utility: formats a date into yyyy-MM-dd
 */
function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function getSheetLink() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}



//======================================
// FILE: Tests.gs
//======================================

function testNominationDateUpdate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.membershipSheetName);
  const row = 8;
console.log("Sheet: " + sheet.getName());
  updateNominationStatus(sheet,row);

}

function triggerAuth() {
  var url = ScriptApp.getService().getUrl();
    const webAppUrl =  CONFIG.webAppURL || ScriptApp.getService().getUrl(); 
  Logger.log(webAppUrl);
}

function verifyMyToken(){
var myToken = "dm90ZXxKb2huIFd5YXR0fEpvaG4gV3lhdHR8OHxGcmkgSmFuIDMwIDIwMjYgMTY6MDQ6MTggR01UKzExMDAgKEF1c3RyYWxpYW4gRWFzdGVybiBEYXlsaWdodCBUaW1lKXw0MTljOWZlNzgwM2NkNGI0ZGM4YjU0NTk3Njg4NmFkNTQxZjYxNDc4NTU0YWYwZTQ3OTA1NmU0NDI1YzRkZmQ1"

result = verifyToken(myToken)
Logger.log("result.type: " + result.type);
Logger.log("result.email " + result.committeeMember);
Logger.log("result.param " + result.applicantName);
Logger.log("result.row " + result.applicantRow);
}

function testDisplayApplication() {
  // 1. Create a mock event object simulating ?token=8
  var mockEvent = {
    parameter: {
      token: "8" // Change this number to test different rows
    }
  };

  // 2. Call your doGet function with the mock data
  var output = doGet(mockEvent);
  
  // 3. Log the HTML content to the execution log
  // This helps verify that the HTML is being generated without errors
  Logger.log("Content Title: " + output.getTitle());
  Logger.log("HTML Preview: " + output.getContent().substring(0, 500) + "...");
}

function richTextTest(){

  const text = "Seconder: ";
  const comment = "this is a comment";
  richTextTest(text);
  comment = text + comment;
  console.log("text: " + comment);
}

function testDeliberationEmails() {

  const ss = SpreadsheetApp.openById('1N9SFZ65rx7EA6XDBh7FUEmI504r_1aF3NYUVOg8g8Xk');
  const sheet = ss.getSheetByName('Membership Applications');
  const row = 8
  sendDeliberationEmails(sheet, row);
}

function testCommittee() {
  var approving = getApprovingCommitteeMembers();
  var notification = getNotificationCommitteeMembers();
  var emails = getCommitteeEmails(3,6);
  var names  = getCommitteeEmails(2,6,true);
  var committee = getCommittee();


//    role: row[0],
//    member: row[1],
//    email: row[2],
//    phone: row[3],
//    notifyApplication: row[4],
//    approveApplication: row[5]

  if (emails) {
    emails.forEach((m, index) => {
      Logger.log(" Role: " + m.role[index][0] + " Member: " + m.menber[index][1] + " Email: " + m.email[index][2] + " " + m.notifyApplication[index][4] + " " + m.approveApplication[index][5]);
  })
  }

  Logger.log(" Committee: " + committee.length + " " + committee.values);
  Logger.log(" Approving: " + approving.length);
  Logger.log(" notification: " + notification.length);
  Logger.log(" emails: " + emails.length);
  Logger.log(" names: " + names.length);
  
}

