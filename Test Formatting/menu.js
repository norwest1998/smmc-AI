function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tests')
    .addItem('Format Overall Sheet', 'applyOverallFormatting')
    .addItem('Format Round Sheet', 'applyRoundCardFormatting')
    .addToUi();
}
