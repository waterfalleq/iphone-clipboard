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
const stateFilePath = resolve(".client-state.json");
const trayIconDataUrl =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACTSURBVHgBpZKBCYAgEEV/TeAIjuIIbdQIuUGt0CS1gW1iZ2jIVaTnhw+Cvs8/OYDJA4Y8kR3ZR2/kmazxJbpUEfQ/Dm/UG7wVwHkjlQdMFfDdJMFaACebnjJGyDWgcnZu1/lrCrl6NCoEHJBrDwEr5NrT6ko/UV8xdLAC2N49mlc5CylpYh8wCwqrvbBGLoKGvz8Bfq0QPWEUo/EAAAAASUVORK5CYII=";
let tray = null;
let lastImageId = null;

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
			return;
		}

		console.log("New image found:", latest.id);

		await copyLatestImage();

		lastImageId = latest.id;
		await saveLastImageId(lastImageId);
	} catch (error) {
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

	while (true) {
		await checkLatest();
		await sleep(2000);
	}
}

app.whenReady().then(() => {
	try {
		if (!apiUrl || !apiToken) {
			throw new Error("API_URL and API_TOKEN are required");
		}

		const trayIcon =
			nativeImage.createFromDataURL(trayIconDataUrl);

		tray = new Tray(trayIcon);

		const trayMenu = Menu.buildFromTemplate([
			{
				label: "Status: running",
				enabled: false,
			},
			{
				type: "separator",
			},
			{
				label: "Copy latest now",
				click: async () => {
					try {
						await copyLatestImage();
					} catch (error) {
						console.error(
							"Copy failed:",
							error.message
						);
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

		tray.setToolTip("iPhone Clipboard");
		tray.setContextMenu(trayMenu);

		console.log("Tray app is running");
		startPolling();
	} catch (error) {
		console.error("Desktop startup failed:", error.message);
		app.quit();
	}
});
