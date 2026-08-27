//======================================
// FILE: appsscript.html
//======================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "MYSELF"
  }
}

//======================================
// FILE: config.gs
//======================================

/* config.gs
* Global configuration, property keys, and setter helpers.
*/

const PROP_FB_POSTING_ID = "PROP_FB_POSTING_ID";
const PROP_FACEBOOK_PAGE_ID = "FACEBOOK_PAGE_ID";
const PROP_FACEBOOK_PAGE_ACCESS_TOKEN = "FACEBOOK_PAGE_ACCESS_TOKEN";

function getConfig() {
  // returns runtime-config, preferring script properties over hardcoded constants
  const props = PropertiesService.getScriptProperties();
  return {

    fbPageId: props.getProperty(PROP_FACEBOOK_PAGE_ID) || null,
    fbToken: props.getProperty(PROP_FACEBOOK_PAGE_ACCESS_TOKEN) || null,
    fbPostingSheetID: props.getProperty(PROP_FB_POSTING_ID) || null
  };
}


//======================================
// FILE: Main.gs
//======================================

function processNextFacebookPost() {
   const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.fbPostingSheetID);
  const sheet = ss.getSheetByName('Queue');


  const rows = sheet.getDataRange().getValues();

  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] !== 'PENDING') continue;

    // Mark processing
    sheet.getRange(r + 1, 1).setValue('PROCESSING');
    sheet.getRange(r + 1, 7).setValue(new Date());

    try {
      processFacebookQueueRow(rows[r], r + 1, sheet);
    } catch (e) {
      sheet.getRange(r + 1, 1).setValue('FAILED');
      sheet.getRange(r + 1, 13).setValue(e.message);
    }
    return; // one per run
  }
}

function processFacebookQueueRow(row, rowIndex, queueSheet) {
  const [
    status,
    spreadsheetID,
    roundSheetId,
    spreadsheetName,
    sheetName,
    regattaName,
    raceDate,
    raceReport
  ] = row;

  const pngBlob = renderRoundSheetToPNG(spreadsheetID,roundSheetId);

  let caption = raceReport;
  if (!caption) {
     caption = `${regattaName}\n results from races held on ${raceDate}`;
  }

  const postId = postPNGToFacebook(pngBlob, caption);

  queueSheet.getRange(rowIndex, 1).setValue('POSTED');
  queueSheet.getRange(rowIndex, 11).setValue(postId);
  queueSheet.getRange(rowIndex, 9).setValue(new Date());

  annotateRoundSheet(spreadsheetID, postId);
}

function annotateRoundSheet(spreadsheetID, postId) {
  const file = DriveApp.getFileById(spreadsheetID);
  const currentDesc = file.getDescription(); 
  const description = currentDesc + `\nFacebook posted\nPost ID: ${postId}\n${new Date().toISOString()}`;
  
  file.setDescription(description);
}



//======================================
// FILE: renderRoundSheetToPNG.gs
//======================================

function renderRoundSheetToPNG(spreadhseetID, roundSheetId) {
  const ss = SpreadsheetApp.openById(spreadhseetID);
  const sheet = ss.getSheetById(roundSheetId);
  const values = sheet.getDataRange().getDisplayValues();

  const headerRowIndex = values.findIndex(r => String(r[1]).trim() === 'Pos');
  if (headerRowIndex === -1) {
    throw new Error('Heading row not found');
  }

  const headers = values[headerRowIndex].map(h => String(h).trim());

  const idx = {
    pos: headers.indexOf('Pos'),
    sail: headers.indexOf('Sail #'),
    name: headers.indexOf('Competitor'),
    result: headers.indexOf('Result')
  };

  const raceCols = [];
  headers.forEach((h, i) => {
    if (/^R\d+$/.test(h)) raceCols.push(i);
  });

  const dt = Charts.newDataTable();
  dt.addColumn(Charts.ColumnType.STRING, 'Pos');
  dt.addColumn(Charts.ColumnType.STRING, 'Sail #');
  dt.addColumn(Charts.ColumnType.STRING, 'Competitor');
  dt.addColumn(Charts.ColumnType.STRING, 'Result');
  raceCols.forEach(c => dt.addColumn(Charts.ColumnType.STRING, headers[c]));

  let rowCount = 0;

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    if (!values[r][idx.pos]) continue;
    const posVal   = String(values[r][idx.pos]   || '').trim();
    const sailVal  = String(values[r][idx.sail]  || '').trim();
    const nameVal  = values[r][idx.name] || '';               // name stays plain
    const resultVal = String(values[r][idx.result] || '').trim();
    const row = [
      `<span style="display:inline-block; width:40px; text-align:center;">${posVal}</span>`,
      `<span style="display:inline-block; width:60px; text-align:center;">${sailVal}</span>`,
      nameVal,   // ← left aligned, no wrap
      `<span style="display:inline-block; width:50px; text-align:center;">${resultVal}</span>`
    ];

    raceCols.forEach(c => {
      let val = String(values[r][c] || '').trim();
      if (val.startsWith('(') && val.endsWith(')')) {
      // dropped races: italic + gray + centered
        val = `<span style="display:inline-block; width:50px; text-align:center;"><i style="color:#777;">${val}</i></span>`;
      } else {
        // normal race result: centered
        val = `<span style="display:inline-block; width:50px; text-align:center;">${val}</span>`;
      }
      row.push(val)
      });
    dt.addRow(row);
    rowCount++;
  }

  const totalWidth = 40 + 60 + 220 + 55 + raceCols.length * 50;
  const totalHeight = (rowCount + 1) * 32 + 30;

  const chart = Charts.newTableChart()
    .setDataTable(dt.build())
    .setOption('allowHtml', true)
    .setOption('showRowNumber', false)
    .setOption('cssClassNames', {               // only helps if embedded, but harmless
      headerRow: 'bold-header',
      tableRow: '',
      oddTableRow: 'odd-row'    })
    .setOption('alternatingRowStyle', true)     // light gray alternate rows
    .setDimensions(totalWidth, totalHeight)
    .build();

    return chart.getAs('image/png').setName('RoundResults.png');
  }

function postPNGToFacebook(pngBlob, caption) {
  const cfg = getConfig();
  if (!cfg.fbPageId || !cfg.fbToken) {
    throw new Error('Facebook credentials missing');
  }

  const response = UrlFetchApp.fetch(
    `https://graph.facebook.com/${cfg.fbPageId}/photos`,
    {
      method: 'post',
      payload: {
        source: pngBlob,
        caption,
        access_token: cfg.fbToken
      },
      muteHttpExceptions: true
    }
  );

  const result = JSON.parse(response.getContentText());
  if (!result.id) {
    throw new Error(response.getContentText());
  }

  return result.id;
}



//======================================
// FILE: Menu.gs
//======================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Facebook Test')
    .addItem('Post Round Sheet', 'showFacebookPostSidebar')
    .addToUi();
}


//======================================
// FILE: sidebar.gs
//======================================

function showFacebookPostSidebar() {
  const ss = SpreadsheetApp.getActive();
  const sheets = ss.getSheets().map(s => s.getName());
  
  const html = HtmlService.createTemplateFromFile('FacebookPostSidebar');
  html.sheets = sheets; // pass the sheet names to the template
  const sidebar = html.evaluate()
    .setTitle('Facebook Round Posting')
    .setWidth(300);
  
  SpreadsheetApp.getUi().showSidebar(sidebar);
}


//======================================
// FILE: Sidebar.html
//======================================

<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <form id="fbForm">
      <label for="sheetSelect">Select Round Sheet:</label><br>
      <select id="sheetSelect" name="sheetName">
        <? for (var i = 0; i < sheets.length; i++) { ?>
          <option value="<?= sheets[i] ?>"><?= sheets[i] ?></option>
        <? } ?>
      </select>
      <br><br>
      <label for="regattaName">Regatta Name:</label><br>
      <input type="text" id="regattaName" name="regattaName" placeholder="Club Racing">
      <br><br>
      <label for="raceDate">Race Date (YYYY-MM-DD):</label><br>
      <input type="text" id="raceDate" name="raceDate">
      <br><br>
      <label for="raceReport">Race Report (optional):</label><br>
      <textarea id="raceReport" name="raceReport"></textarea>
      <br><br>
      <input type="button" value="Enqueue for Facebook" onclick="submitForm()">
    </form>

    <script>
      function submitForm() {
        const sheetName = document.getElementById('sheetSelect').value;
        const regattaName = document.getElementById('regattaName').value;
        const raceDate = document.getElementById('raceDate').value;
        const raceReport = document.getElementById('raceReport').value;

        google.script.run.withSuccessHandler(() => {
          alert('Round sheet enqueued for Facebook posting!');
        }).enqueueFacebookFromSidebar(sheetName, regattaName, raceDate, raceReport);
      }
    </script>
  </body>
</html>


//======================================
// FILE: FacebookQueue.gs
//======================================

function enqueueFacebookFromSidebar(sheetName, regattaName, raceDate, raceReport) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const sheetId = ss.getId(); // the spreadsheet ID (round sheet is in the same file)
  
  enqueueFacebookTestRow({
    sheetId: sheetId,
    regattaName: regattaName,
    raceDate: raceDate,
    raceReport: raceReport
  });
}


