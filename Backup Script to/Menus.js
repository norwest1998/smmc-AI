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
