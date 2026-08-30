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