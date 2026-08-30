function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Facebook Test')
    .addItem('Post Round Sheet', 'showFacebookPostSidebar')
    .addToUi();
}
