/**
 * Searches the Race Results Upload Google Drive folder for any JSON files.
 * 
 * @param {string} folderId - Google Drive Folder ID where JSON files land.
 * @return {DriveApp.File|null} The File object if found, or null if no file is present.
 * 
 * Reads JSON file to pass to Race Results Processor
 * 
 * Calls Race ResultProcessing web App API to process Results
 * 
 * Moves File to Processed Folder
 * 
 * Updates Calendar event to Processed
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 */