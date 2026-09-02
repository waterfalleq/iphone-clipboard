const {
	contextBridge,
	ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld("settingsApi", {
	load: () => ipcRenderer.invoke("settings:load"),
	testAndSave: (configuration) =>
		ipcRenderer.invoke(
			"settings:test-and-save",
			configuration
		),
});
