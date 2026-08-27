========================================
FILE: appsscript.html
========================================

{
  "timeZone": "Australia/Sydney",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Drive",
        "version": "v2",
        "serviceId": "drive"
      }
    ]
  },
    "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.projects",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.container.ui",
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.processes"
  ]
}

========================================
FILE: Config.gs
========================================


const PROP_Spreadsheet_ID = "Spreadsheet_ID";
const PROP_Sheet_ID = "Sheet_ID";
const PROP_Folder_ID = "Folder_ID";
const FolderName = "Scripts Backup"

let CONFIG_CACHE = null;

function getConfig() {
  if (CONFIG_CACHE === null) {
    // getProperties() fetches ALL key-value pairs in a single API call
    const props = PropertiesService.getScriptProperties().getProperties();
    
    CONFIG_CACHE = {
      spreadsheetId: props[PROP_Spreadsheet_ID] || null,
      sheetId: props[PROP_Sheet_ID] || null,
      folderId: props[PROP_Folder_ID] || null
    };
  }
  return CONFIG_CACHE;
}

let PROJECTDATA = null;

function getMasterData() {
  // Only execute spreadsheet reads if any cache variable is missing
  if (!PROJECTDATA) { 
    const cfg = getConfig();
    const ss = SpreadsheetApp.openById(cfg.spreadsheetId);

    if (PROJECTDATA === null) {
      const sheet = ss.getSheetById(cfg.sheetId);
      PROJECTDATA = sheet.getDataRange().getValues();
    }
  }

  // Return as an object so all 3 data sets are accessible cleanly
  return PROJECTDATA;
}

========================================
FILE: Code.gs
========================================

/**
 * Exports all Apps Script projects from Google Drive as individual .txt files.
 * Uses native Drive API v2 to bypass Google Cloud console API restrictions.
 */
function exportAllAppsScriptsToTxt() {

  Logger.log("In ExportAll");

  const projectData = getMasterData();
  let count = 0;

  for (var i = 1; i < projectData.length; i++) {
    var enabled = projectData[i][0];
    var projectName = projectData[i][1];
    var fileId = projectData[i][2]
    
    if (!enabled || !projectName || !fileId) continue;

    if (enabled) {     
      Logger.log(`Processing project: "${projectName}"...`);
      Logger.log("fileId: " + fileId);

      try {
        var txtFileName = convertScriptToTxt(fileId, projectName);    
        count++;
        Logger.log(` Saved: ${txtFileName}`);
      } catch (e) {
        Logger.log(`❌ Error exporting "${projectName}": ${e.toString()}`);
      }
    }
  }

  Logger.log(` Finished! Exported ${count} project(s) to "${FolderName}".`);
}

function convertScriptToTxt(fileId, fileName) {
  Logger.log("Received fileId/scriptId: " + fileId);

  if (!fileId || typeof fileId !== 'string' || fileId === "undefined") {
    Logger.log("Error: Invalid scriptId passed to convertScriptToTxt.");
    return {
      success: false,
      message: "Invalid Script ID received: '" + fileId + "'"
    };
  }

  // 1. Fetch project content from the Google Apps Script REST API
  const url = `https://script.googleapis.com/v1/projects/${fileId}/content`;
  const options = {
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  
  if (response.getResponseCode() !== 200) {
    Logger.log("Error fetching script: " + response.getContentText());
    return {
      success: false,
      message: `API Error (${response.getResponseCode()}): ${response.getContentText()}`
    };
  }

  const projectData = JSON.parse(response.getContentText());

  // 2. Format the project files into a single text output
  let textOutput = "";
  if (projectData.files && projectData.files.length > 0) {
    projectData.files.forEach(file => {
      textOutput += `========================================\n`;
      textOutput += `FILE: ${file.name}.${file.type === 'SERVER_JS' ? 'gs' : 'html'}\n`;
      textOutput += `========================================\n\n`;
      textOutput += file.source + `\n\n`;
    });
  }

  // Load config to get the target folder ID
  const cfg = getConfig();
  const folderId = cfg.folderId || cfg.Folder_ID; // Fallback to handle exact property casing

  if (!folderId) {
    return {
      success: false,
      message: "Target Folder ID not found in getConfig()."
    };
  }
  
  try {
    const backupFolder = DriveApp.getFolderById(folderId);
    const txtFileName = fileName + " txt";
    
    // Create file directly inside the target folder
    const txtFile = backupFolder.createFile(txtFileName, textOutput, MimeType.PLAIN_TEXT);
    Logger.log("Created TXT File in folder: " + txtFile.getUrl());

    // Update Column D in the spreadsheet with the current timestamp
    updateLastBackupDate(fileId);

    return {
      success: true,
      projectName: fileName,
      status: "Exported",
      duration: 1.0
    };
  } catch (e) {
    Logger.log("Folder Access Error: " + e.toString());
    return {
      success: false,
      message: "Could not write to destination folder ID: " + folderId 
    };
  }
}

/**
 * Fetches the highest version number created for an Apps Script project.
 * @param {string} scriptId - The Google Apps Script project/file ID.
 * @return {number|string} The latest version number, or status text if none exists.
 */
function getLatestVersionNumber(scriptId) {
  if (!scriptId) return "N/A";

  const url = `https://script.googleapis.com/v1/projects/${scriptId}/versions`;
  const options = {
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data.versions && data.versions.length > 0) {
        // Return the highest version number from the versions array
        const latestVersion = data.versions[data.versions.length - 1];
        return latestVersion.versionNumber; 
      }
      return "HEAD";
    }
  } catch (e) {
    Logger.log(`Error fetching version for ${scriptId}: ` + e.toString());
  }

  return "N/A";
}

function updateLastBackupDate(fileId) {
  try {
    const cfg = getConfig();
    const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
    const sheet = ss.getSheetById(cfg.sheetId);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      // Column C (index 2) contains the file/script ID
      if (data[i][2] === fileId) {
        // Column D is column index 4
        var version = getLatestVersionNumber(fileId);
        var executed = getLastExecutionTime(fileId);
        sheet.getRange(i + 1, 6).setValue(executed);
        sheet.getRange(i + 1, 5).setValue(version);
        sheet.getRange(i + 1, 4).setValue(new Date());
        break;
      }
    }
  } catch (e) {
    Logger.log("Failed to update last backup date: " + e.toString());
  }
}

/**
 * Gets the start time of the most recent execution for a given script ID.
 * @param {string} scriptId
 * @return {Date|string} The date of last execution, or message if none found.
 */
function getLastExecutionTime(scriptId) {
  if (!scriptId) return "N/A";

  const url = `https://script.googleapis.com/v1/processes:listScriptProcesses?scriptId=${scriptId}&pageSize=1`;
  const options = {
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data.processes && data.processes.length > 0) {
        // Return formatted Date object of the most recent run
        return new Date(data.processes[0].startTime);
      }
      return - 30;
    }
  } catch (e) {
    Logger.log(`Error fetching execution log for ${scriptId}: ` + e.toString());
  }

  return "N/A";
}

function exportProject(projectName, fileId) {
  try {
    const driveFile = DriveApp.getFileById(fileId);
    Logger.log("DriveFile: " + driveFile);

    const downloadUrl = driveFile.exportLinks ? driveFile.exportLinks["application/vnd.google-apps.script+json"] : null;
    Logger.log("downloadUrl: " + downloadUrl);

    if (!downloadUrl) return;
    Logger.log("In Download");

    const response = UrlFetchApp.fetch(downloadUrl, {
      headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log(`⚠️ Skipped "${projectName}": HTTP ${response.getResponseCode()}`);
      return;
    }

    const projectJson = JSON.parse(response.getContentText());
    Logger.log(projectJson);

    const files = projectJson.files || [];

    // 5. Build text payload
    let txtContent = `==================================================\n`;
    txtContent += `PROJECT: ${projectName}\n`;
    txtContent += `EXPORT DATE: ${new Date().toISOString()}\n`;
    txtContent += `==================================================\n\n`;

    files.forEach(f => {
      const ext = f.type === "HTML" ? "html" : "gs";
      txtContent += `--------------------------------------------------\n`;
      txtContent += `FILE: ${f.name}.${ext}\n`;
      txtContent += `--------------------------------------------------\n\n`;
      txtContent += `${f.source}\n\n\n`;
    });

    // 6. Save as plain text file in Drive
    var txtFileName = `${projectName.replace(/[\/\\:]/g, "_")}.txt`;
    folder.createFile(txtFileName, txtContent, MimeType.PLAIN_TEXT);

    Logger.log(`Successfully exported bound project: ${projectName}`);
    return txtFileName;
  } catch(e) {
    Logger.log(`Failed on ID ${fileId}: ${e.toString()}`);
    txtFileName = "ERROR on File " + projectName;
  }
}


========================================
FILE: Menus.gs
========================================

function onOpen() {

  SpreadsheetApp.getUi()

    .createMenu("Backup Dashboard")

    .addItem("Backup All Projects", 'exportAllAppsScriptsToTxt')

    .addItem("Backup Selected Project", 'menuBackupSelected')

    .addToUi();

}

function menuBackupSelected() {

  ProjectSelector.show({

    title: "Backup Project",

    action: "backup"

  });

}


========================================
FILE: Projects.gs
========================================

const Projects = (() => {

function getEnabled() {

  return getAll()
    .filter(project => project.enabled)
    .sort((a, b) =>
      a.projectName.localeCompare(b.projectName)
    );
  }
  return {
    getEnabled  
  };

})
();


function getAll() {
  cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const ws = ss.getSheetById(cfg.sheetId);

  const values = ws.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values.shift();

  return values.map((row, index) => {

    const project = {
      row: index + 2
    };

    headers.forEach((header, col) => {
      project[toPropertyName(header)] = row[col];
    });

    return project;

  });

}

function toPropertyName(header) {

  return header
    .trim()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join("");

}

========================================
FILE: ProjectSelector.gs
========================================

/**
 * ============================================================================
 * Backup Dashboard
 * ----------------------------------------------------------------------------
 * File      : ProjectSelector.gs
 * Purpose   : Displays the Project Selector dialog.
 * ============================================================================
 */

const ProjectSelector = (() => {

  /**
   * Shows the selector.
   *
   * @param {Object} options
   */
  function show(options) {

    const template =
      HtmlService.createTemplateFromFile(
        "projectSelector"
      );

    template.options = options;

    Logger.log("Options: " + options);

    template.projects =
      Projects.getEnabled();
  
    Logger.log("Script id: " + template.projects[0]);

    const html = template
      .evaluate()
      .setWidth(550)
      .setHeight(340)

    SpreadsheetApp
      .getUi()
      .showModalDialog(
        html,
        options.title
      );

  }

  /**
   * Executes the selected action.
   *
   * @param {string} action
   * @param {string} scriptId
   */
  function execute(action, scriptId) {

    ProjectSelector.execute(
      action,
      scriptId
  );
  }

  function backupSelectedProject(scriptId) {

    convertScriptToTxt(scriptId);

  }



  return {

    show,
    execute,
    backupSelectedProject
    
  };

})
();




========================================
FILE: projectSelector.html
========================================

<!DOCTYPE html>

<html>

<head>

  <base target="_top">

  <style>

    body{
      font-family:Arial,sans-serif;
      margin:20px;
    }

    select{
      width:100%;
      padding:6px;
      margin-top:10px;
      margin-bottom:20px;
    }

    .buttons{

      text-align:right;

    }

  </style>

</head>

<body>

<h3><?= options.title ?></h3>

<select id="project">
  <? projects.forEach(function(project){ ?>
    <option value="<?= project.scriptID || project.scriptId ?>" data-project-name="<?= project.projectName ?>">
      <?= project.projectName ?>
    </option>
  <? }); ?>
</select>

<div class="buttons">
  <button onclick="google.script.host.close()">
    Cancel
  </button>
  <button id="backupBtn" onclick="backup()">
    Backup
  </button>
</div>

<script>

function backup() {

    const button =
        document.getElementById("backupBtn");

    button.disabled = true;
    button.innerHTML = "Backing up...";

    const projectSelect = document.getElementById("project");
    // Get the selected <option> element
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    
    const scriptId = selectedOption.value;
    const fileName = selectedOption.getAttribute("data-project-name");

    google.script.run

        .withSuccessHandler(function(result){

            if (result.success) {

                alert(
                    "Backup completed successfully.\n\n" +
                    "Project : " + result.projectName +
                    "\nStatus  : " + result.status +
                    "\nTime    : " +
                    result.duration.toFixed(1) +
                    " seconds"
                );

                google.script.host.close();

            }
            else {
                button.disabled = false;
                button.innerHTML = "Backup";

                alert(
                    "Backup failed.\n\n" +
                    result.message
                );

            }

        })

        .withFailureHandler(function(error){
            button.disabled = false;
            button.innerHTML = "Backup";
            alert(error.message);


        })

        .convertScriptToTxt(scriptId,fileName);

}

</script>

</body>

</html>

========================================
FILE: Untitled.gs
========================================

function myFunction() {
      try {
      // 3. Fetch project content directly via the Drive API Service
      const driveFile = Drive.Files.get(fileId);
      const downloadUrl = driveFile.exportLinks ? driveFile.exportLinks["application/vnd.google-apps.script+json"] : null;

      if (!downloadUrl) {
        Logger.log(`⚠️ Skipped "${projectName}": Export link not available.`);
        return;
      }

      // 4. Download and parse code files
      const response = UrlFetchApp.fetch(downloadUrl, {
        headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log(`⚠️ Skipped "${projectName}": HTTP ${response.getResponseCode()}`);
        return;
      }

      const projectJson = JSON.parse(response.getContentText());
      const files = projectJson.files || [];

      // 5. Build text payload
      let txtContent = `==================================================\n`;
      txtContent += `PROJECT: ${projectName}\n`;
      txtContent += `EXPORT DATE: ${new Date().toISOString()}\n`;
      txtContent += `==================================================\n\n`;

      files.forEach(f => {
        const ext = f.type === "HTML" ? "html" : "gs";
        txtContent += `--------------------------------------------------\n`;
        txtContent += `FILE: ${f.name}.${ext}\n`;
        txtContent += `--------------------------------------------------\n\n`;
        txtContent += `${f.source}\n\n\n`;
      });

      // 6. Save as plain text file in Drive
      const txtFileName = `${fileName.replace(/[\/\\:]/g, "_")}.txt`;
      folder.createFile(txtFileName, txtContent, MimeType.PLAIN_TEXT);
      
      count++;
      Logger.log(` Saved: ${txtFileName}`);

    } catch (e) {
      Logger.log(`❌ Error exporting "${projectName}": ${e.toString()}`);
    }
}

function testGetAllOutput() {
  const data = getAll();
  Logger.log("--- GENERATED PROPERTY KEYS ---");
  Logger.log(Object.keys(data[0])); 
}


