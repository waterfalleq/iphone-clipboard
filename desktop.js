import {
	app,
	clipboard,
	ClipboardItem,
	Menu,
	nativeImage,
	Tray,
} from "electron";
import {
	readFile,
	writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

process.loadEnvFile(".dev.vars");
process.loadEnvFile(".client.env");

const apiUrl = process.env.API_URL;
const apiToken = process.env.API_TOKEN;
const legacyStateFilePath = resolve(".client-state.json");
const trayIconDataUrl =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACTSURBVHgBpZKBCYAgEEV/TeAIjuIIbdQIuUGt0CS1gW1iZ2jIVaTnhw+Cvs8/OYDJA4Y8kR3ZR2/kmazxJbpUEfQ/Dm/UG7wVwHkjlQdMFfDdJMFaACebnjJGyDWgcnZu1/lrCrl6NCoEHJBrDwEr5NrT6ko/UV8xdLAC2N49mlc5CylpYh8wCwqrvbBGLoKGvz8Bfq0QPWEUo/EAAAAASUVORK5CYII=";
let tray = null;
let lastImageId = null;
let stateFilePath = null;
let connectionStatus = "Starting…";
let lastCopyStatus = "Last copied this session: not yet";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

async function readLastImageId(filePath) {
	const stateText = await readFile(filePath, "utf8");
	const state = JSON.parse(stateText);

	return state.lastImageId ?? null;
}

async function loadLastImageId() {
	try {
		return await readLastImageId(stateFilePath);
	} catch (error) {
		if (error.code !== "ENOENT") {
			throw error;
		}
	}

	try {
		const legacyImageId =
			await readLastImageId(legacyStateFilePath);

		await saveLastImageId(legacyImageId);
		console.log("State moved to Electron user data");

		return legacyImageId;
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
			label: "Copy latest now",
			click: async () => {
				setConnectionStatus("Copying latest…");

				try {
					await copyLatestImage();
					markImageCopied();
					setConnectionStatus("Waiting for image");
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

async function copyLatestImage() {
	const response = await fetch(`${apiUrl}/image`, {
		headers: {
			Authorization: `Bearer ${apiToken}`,
		},
	});

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

	const imageSize = image.getSize();

	console.log(
		`Image copied: ${imageSize.width}x${imageSize.height}`
	);
}

async function checkLatest() {
	try {
		const response = await fetch(`${apiUrl}/latest`, {
			headers: {
				Authorization: `Bearer ${apiToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(
				`Latest request failed with status ${response.status}`
			);
		}

		const latest = await response.json();

		if (!latest.available || latest.id === lastImageId) {
			setConnectionStatus("Waiting for image");
			return;
		}

		console.log("New image found:", latest.id);
		setConnectionStatus("Downloading image…");

		await copyLatestImage();
		markImageCopied();

		lastImageId = latest.id;
		await saveLastImageId(lastImageId);
		setConnectionStatus("Waiting for image");
	} catch (error) {
		setConnectionStatus("Error — see logs");
		console.error("Polling failed:", error.message);
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

	while (true) {
		await checkLatest();
		await sleep(2000);
	}
}

function createDesktopApp() {
	try {
		if (!apiUrl || !apiToken) {
			throw new Error("API_URL and API_TOKEN are required");
		}

		stateFilePath = resolve(
			app.getPath("userData"),
			"client-state.json"
		);

		const trayIcon =
			nativeImage.createFromDataURL(trayIconDataUrl);

		tray = new Tray(trayIcon);
		updateTrayMenu();

		console.log("Tray app is running");
		startPolling();
	} catch (error) {
		console.error("Desktop startup failed:", error.message);
		app.quit();
	}
}

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		console.log("Second instance prevented");
	});

	app.whenReady().then(createDesktopApp);
}
