var UiController = {

  buildMenu() {
    const ui = SpreadsheetApp.getUi();

    ui.createMenu('Coordinator Tools')
      .addItem('Refresh Fleet Data', 'ResultsSheetParser.UiController.refresh_')
      .addSeparator()
      .addItem('Validate races', 'ResultsSheetParser.UiController.validate_')
      .addSeparator()
      .addItem('Finalize & Submit', 'ResultsSheetParser.UiController.finalize_')
      .addToUi();
    loadRegattasToConfig()

  },
  /**
   * Manual refresh config entry point (menu)
   */
  refresh_() {
    refreshConfigFromClubManagement();
    SpreadsheetApp.getUi()
      .alert('Refresh successful. All current Fleet data is available.');
  },
  /**
   * Manual validation entry point (menu)
   */
  validate_() {
    ValidationController.validateAllOrThrow();
    SpreadsheetApp.getUi()
      .alert('Validation successful. All races are consistent.');
  },
  /**
   * Manual Race Report edit (menu)
   */
  editReport_() {
    openSidebar();
  },
  /**
   * Manual Race Report edit (menu)
   */
  genReport_() {
    genRaceReport();
  },
  /**
   * Manual finalize entry point (menu)
   */
  finalize_() {
    ValidationController.validateAllOrThrow();
    UploadController.archiveAndReset();
    SpreadsheetApp.getUi()
      .alert('Regatta archived and sheet reset.');
  }
  
};
