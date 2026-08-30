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


