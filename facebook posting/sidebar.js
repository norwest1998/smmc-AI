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
