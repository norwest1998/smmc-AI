function onTemplateOpen(e) {
  _Dispatcher.onNewOpen(e);
}

function onTemplateEdit(e) {
  _Dispatcher.onNewEdit(e);
}

function onTemplateSubmit(e) {
  _Dispatcher.onNewSubmit(e);
}

const _Dispatcher = {
  onNewOpen(e) { 
    UiController.buildMenu(); 
  }, 
  onNewEdit(e) {
    FleetController.onNewEdit(e);
  },
  onNewSubmit(e) {
    const result = ValidationController.validateAllOrThrow();
    if(!result === "OK") return;
    UploadController.archiveAndReset();
  }
};
