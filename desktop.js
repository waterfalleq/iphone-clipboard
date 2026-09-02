import {
	app,
	BrowserWindow,
	clipboard,
	ClipboardItem,
	ipcMain,
	Menu,
	nativeImage,
	safeStorage,
	Tray,
} from "electron";
import {
	readFile,
	writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadConfiguration,
	saveConfiguration,
	validateConfiguration,
} from "./configuration.js";

const requestTimeoutMilliseconds = 10000;
const normalPollingDelayMilliseconds = 2000;
const maximumPollingDelayMilliseconds = 16000;
const trayIconPath = fileURLToPath(
	new URL("./assets/tray-icon.png", import.meta.url)
);
const successTrayIconPath = fileURLToPath(
	new URL("./assets/tray-icon-success.png", import.meta.url)
);
const settingsHtmlPath = fileURLToPath(
	new URL("./settings.html", import.meta.url)
);
const settingsPreloadPath = fileURLToPath(
	new URL("./settings-preload.cjs", import.meta.url)
);
let tray = null;
let settingsWindow = null;
let defaultTrayIcon = null;
let successTrayIcon = null;
let successIconTimeout = null;
let lastImageId = null;
let stateFilePath = null;
let configurationFilePath = null;
let apiUrl = null;
let apiToken = null;
let copyInProgress = false;
let pollingStarted = false;
let connectionStatus = "Starting…";
let lastCopyStatus = "Last copied this session: not yet";
let lastPollingErrorMessage = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function openSettingsWindow() {
	if (settingsWindow) {
		settingsWindow.show();
		settingsWindow.focus();
		return;
	}

	settingsWindow = new BrowserWindow({
		title: "iPhone Clipboard Settings",
		icon: trayIconPath,
		width: 460,
		height: 350,
		show: false,
		resizable: false,
		maximizable: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: settingsPreloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	settingsWindow.setMenu(null);

	settingsWindow.once("ready-to-show", () => {
		settingsWindow.show();
	});
	settingsWindow.on("closed", () => {
		settingsWindow = null;
	});
	settingsWindow.webContents.on(
		"preload-error",
		(_event, _preloadPath, error) => {
			console.error("Settings preload failed:", error.message);
		}
	);
	settingsWindow.loadFile(settingsHtmlPath);
}

async function loadLastImageId() {
	try {
		const stateText = await readFile(stateFilePath, "utf8");
		const state = JSON.parse(stateText);

		return state.lastImageId ?? null;
	} catch (error) {
		if (error.code === "ENOENT") {
			return null;
		}

		throw error;
	}
}

async function saveLastImageId(imageId) {
	const state = {
		lastImageId: imageId,
	};

	await writeFile(
		stateFilePath,
		JSON.stringify(state, null, "\t"),
		"utf8"
	);
}

function updateTrayMenu() {
	if (!tray) {
		return;
	}

	const trayMenu = Menu.buildFromTemplate([
		{
			label: `Status: ${connectionStatus}`,
			enabled: false,
		},
		{
			label: lastCopyStatus,
			enabled: false,
		},
		{
			type: "separator",
		},
		{
			label: "Settings",
			click: openSettingsWindow,
		},
		{
			label: "Copy latest now",
			enabled: Boolean(apiUrl && apiToken),
			click: async () => {
				try {
					const copyStarted = await runCopyOperation(
						async () => {
							setConnectionStatus("Copying latest…");

							const latest = await fetchLatest();

							if (!latest.available) {
								throw new Error("No image is available");
							}

							await copyLatestImage();
							markImageCopied();

							lastImageId = latest.id;
							await saveLastImageId(lastImageId);
							setConnectionStatus("Waiting for image");
						}
					);

					if (!copyStarted) {
						console.log(
							"Manual copy skipped: another copy is running"
						);
					}
				} catch (error) {
					setConnectionStatus("Copy failed");
					console.error("Copy failed:", error.message);
				}
			},
		},
		{
			label: "Quit",
			click: () => {
				app.quit();
			},
		},
	]);

	tray.setToolTip(
		`iPhone Clipboard — ${connectionStatus}`
	);
	tray.setContextMenu(trayMenu);
}

function setConnectionStatus(status) {
	if (connectionStatus === status) {
		return;
	}

	connectionStatus = status;
	console.log("Status:", status);
	updateTrayMenu();
}

function markImageCopied() {
	const copiedAt = new Date().toLocaleTimeString();

	lastCopyStatus = `Last copied: ${copiedAt}`;
	updateTrayMenu();
}

function showCopySuccess() {
	tray.setImage(successTrayIcon);

	if (successIconTimeout) {
		clearTimeout(successIconTimeout);
	}

	successIconTimeout = setTimeout(() => {
		if (!tray.isDestroyed()) {
			tray.setImage(defaultTrayIcon);
		}

		successIconTimeout = null;
	}, 2000);
}

async function runCopyOperation(copyOperation) {
	if (copyInProgress) {
		return false;
	}

	copyInProgress = true;

	try {
		await copyOperation();
		return true;
	} finally {
		copyInProgress = false;
	}
}

async function fetchFromApi(
	path,
	configuration = { apiUrl, apiToken }
) {
	try {
		return await fetch(`${configuration.apiUrl}${path}`, {
			headers: {
				Authorization: `Bearer ${configuration.apiToken}`,
			},
			signal: AbortSignal.timeout(
				requestTimeoutMilliseconds
			),
		});
	} catch (error) {
		if (error.name === "TimeoutError") {
			throw new Error(
				`Request timed out after ${requestTimeoutMilliseconds / 1000} seconds`
			);
		}

		throw error;
	}
}

async function testAndSaveConfiguration(configuration) {
	const validatedConfiguration = validateConfiguration(
		configuration.apiUrl,
		configuration.apiToken
	);
	const response = await fetchFromApi(
		"/latest",
		validatedConfiguration
	);

	if (!response.ok) {
		throw new Error(
			`Connection test failed with status ${response.status}`
		);
	}

	const latest = await response.json();

	if (typeof latest.available !== "boolean") {
		throw new Error("Worker returned an unexpected response");
	}

	await saveConfiguration(
		configurationFilePath,
		safeStorage,
		validatedConfiguration
	);

	apiUrl = validatedConfiguration.apiUrl;
	apiToken = validatedConfiguration.apiToken;
	lastPollingErrorMessage = null;
	setConnectionStatus("Waiting for image");
	ensurePollingStarted();

	return validatedConfiguration;
}

async function fetchLatest() {
	const response = await fetchFromApi("/latest");

	if (!response.ok) {
		throw new Error(
			`Latest request failed with status ${response.status}`
		);
	}

	return response.json();
}

async function copyLatestImage() {
	const response = await fetchFromApi("/image");

	if (!response.ok) {
		throw new Error(
			`Image download failed with status ${response.status}`
		);
	}

	const arrayBuffer = await response.arrayBuffer();
	const imageBuffer = Buffer.from(arrayBuffer);
	const image = nativeImage.createFromBuffer(imageBuffer);

	if (image.isEmpty()) {
		throw new Error("Electron could not decode the image");
	}

	const pngBuffer = image.toPNG();
	const clipboardItem = new ClipboardItem({
		"image/png": new Blob(
			[pngBuffer],
			{ type: "image/png" }
		),
	});

	await clipboard.write([clipboardItem]);
	showCopySuccess();

	const imageSize = image.getSize();

	console.log(
		`Image copied: ${imageSize.width}x${imageSize.height}`
	);
}

function reportPollingFailure(error) {
	if (error.message === lastPollingErrorMessage) {
		return;
	}

	lastPollingErrorMessage = error.message;
	console.error("Polling failed:", error.message);
}

function reportPollingSuccess() {
	if (!lastPollingErrorMessage) {
		return;
	}

	console.log("Polling recovered");
	lastPollingErrorMessage = null;
}

async function checkLatest() {
	try {
		const latest = await fetchLatest();

		if (!latest.available || latest.id === lastImageId) {
			setConnectionStatus("Waiting for image");
			reportPollingSuccess();
			return true;
		}

		const copyStarted = await runCopyOperation(async () => {
			console.log("New image found:", latest.id);
			setConnectionStatus("Downloading image…");

			await copyLatestImage();
			markImageCopied();

			lastImageId = latest.id;
			await saveLastImageId(lastImageId);
			setConnectionStatus("Waiting for image");
		});

		if (!copyStarted) {
			console.log(
				"Automatic copy deferred: another copy is running"
			);
		}

		reportPollingSuccess();
		return true;
	} catch (error) {
		setConnectionStatus("Error — see logs");
		reportPollingFailure(error);
		return false;
	}
}

function sleep(milliseconds) {
	return new Promise((resolvePromise) => {
		setTimeout(resolvePromise, milliseconds);
	});
}

async function startPolling() {
	try {
		lastImageId = await loadLastImageId();
	} catch (error) {
		console.error("State load failed:", error.message);
	}

	console.log("Polling started");
	setConnectionStatus("Connecting…");

	let pollingDelayMilliseconds =
		normalPollingDelayMilliseconds;
	let lastReportedRetryDelayMilliseconds = null;

	while (true) {
		const pollingSucceeded = await checkLatest();

		if (pollingSucceeded) {
			pollingDelayMilliseconds =
				normalPollingDelayMilliseconds;
			lastReportedRetryDelayMilliseconds = null;
		} else if (
			pollingDelayMilliseconds !==
			lastReportedRetryDelayMilliseconds
		) {
			console.log(
				`Retrying in ${pollingDelayMilliseconds / 1000} seconds`
			);
			lastReportedRetryDelayMilliseconds =
				pollingDelayMilliseconds;
		}

		await sleep(pollingDelayMilliseconds);

		if (!pollingSucceeded) {
			pollingDelayMilliseconds = Math.min(
				pollingDelayMilliseconds * 2,
				maximumPollingDelayMilliseconds
			);
		}
	}
}

function ensurePollingStarted() {
	if (pollingStarted) {
		return;
	}

	pollingStarted = true;
	startPolling();
}

async function createDesktopApp() {
	try {
		stateFilePath = resolve(
			app.getPath("userData"),
			"client-state.json"
		);
		configurationFilePath = resolve(
			app.getPath("userData"),
			"config.json"
		);

		defaultTrayIcon =
			nativeImage.createFromPath(trayIconPath);
		successTrayIcon =
			nativeImage.createFromPath(successTrayIconPath);

		if (defaultTrayIcon.isEmpty() || successTrayIcon.isEmpty()) {
			throw new Error("Tray icon could not be loaded");
		}

		tray = new Tray(defaultTrayIcon);
		updateTrayMenu();

		console.log("Tray app is running");

		try {
			const configuration = await loadConfiguration(
				configurationFilePath,
				safeStorage
			);

			if (!configuration) {
				setConnectionStatus("Configuration required");
				return;
			}

			apiUrl = configuration.apiUrl;
			apiToken = configuration.apiToken;
		} catch (error) {
			setConnectionStatus("Configuration error — see logs");
			console.error(
				"Configuration load failed:",
				error.message
			);
			return;
		}

		ensurePollingStarted();
	} catch (error) {
		console.error("Desktop startup failed:", error.message);
		app.quit();
	}
}

ipcMain.handle("settings:load", (event) => {
	if (event.sender !== settingsWindow?.webContents) {
		throw new Error("Settings request came from an unknown window");
	}

	return {
		apiUrl: apiUrl ?? "",
		apiToken: apiToken ?? "",
	};
});

ipcMain.handle(
	"settings:test-and-save",
	async (event, configuration) => {
		if (event.sender !== settingsWindow?.webContents) {
			throw new Error(
				"Settings request came from an unknown window"
			);
		}

		try {
			const savedConfiguration =
				await testAndSaveConfiguration(configuration);

			return {
				success: true,
				message: "Connection successful. Settings saved.",
				apiUrl: savedConfiguration.apiUrl,
			};
		} catch (error) {
			return {
				success: false,
				message: error.message,
			};
		}
	}
);

app.on("window-all-closed", () => {
	console.log("Settings window closed; tray app remains running");
});

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		console.log("Second instance prevented");
	});

	app.whenReady().then(createDesktopApp);
}
