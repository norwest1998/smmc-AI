function getEvents() {
  const webAppUrl = "https://script.google.com/macros/s/AKfycbxh7FmiPU34XJy6hnP-uR3AMfEuApD0fqBDs9fXnkRPYFKgQ-6gv8hapY1aOdeuLuO6ZA/exec";
  const option = "?type=data";
  const targetUrl = webAppUrl + option;
  
  // Configure parameters to follow redirects
  const params = {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(targetUrl, params);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    // Safety check for HTML responses if the web app crashes
    if (responseText.startsWith("<!DOCTYPE")) {
      Logger.log("Web App returned an HTML error instead of JSON. Check Web App execution logs.");
      return null;
    }
    
    // Parse the clean JSON response text
    var result = JSON.parse(responseText);
    
    // Your requested variables are now inside 'result'
    var events = result.events;
    var weatherData = result.weatherData;
    
    Logger.log("Successfully fetched events count: " + events.length);
    return result;
    
  } catch (error) {
    Logger.log("Failed to fetch events: " + error.toString());
  }
}

function getClassImageForAI(className) {
  // 1. Access the specific Google Drive folder using your configuration ID
  const folderId = IMAGE_LIBRARY_ID; 
  const folder = DriveApp.getFolderById(folderId);

  // 2. Search for files matching the class name (handling common image extensions)
  // Expects filenames like "Optimist.jpg", "Laser.png", etc.
  const files = folder.getFilesByName(className + ".jpg");
  let file;
  
  if (files.hasNext()) {
    file = files.next();
  } else {
    // Fallback: Check for PNG if JPG isn't found
    const pngFiles = folder.getFilesByName(className + ".png");
    if (pngFiles.hasNext()) {
      file = pngFiles.next();
    } else {
      Logger.log("No image found for class: " + className);
      return null; // Return null or a default image Base64 string
    }
  }
  
  // 3. Convert the image file bytes into a Base64 encoded string
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const base64Data = Utilities.base64Encode(bytes);
  const contentType = blob.getContentType(); // e.g., "image/jpeg" or "image/png"
  
  // 4. Construct the standard Data URL format
  const aiReadyImageUrl = "data:" + contentType + ";base64," + base64Data;
  
  return aiReadyImageUrl;

}

function getLogoImageForAI() {
  const folderId = cfg.folderId; 
  const folder = DriveApp.getFolderById(folderId);
  
  // Search for the exact filename
  const files = folder.getFilesByName("LOGO TRANSAPARENT.png");
  
  if (files.hasNext()) {
    const file = files.next();
    const blob = file.getBlob();
    const base64Data = Utilities.base64Encode(blob.getBytes());
    return "data:" + blob.getContentType() + ";base64," + base64Data;
  }

  Logger.log("Error: 'LOGO TRANSAPARENT.png' not found in folder.");
  return null;
}
