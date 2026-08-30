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
