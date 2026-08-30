import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const imagePath = resolve("test-image.jpg");
const clipboardScriptPath = resolve("clipboard-windows.ps1");

const apiUrl = process.env.API_URL;
const apiToken = process.env.API_TOKEN;

if (!apiUrl || !apiToken) {
    throw new Error("API_URL and API_TOKEN are required");
}

let lastImageId = null;

async function copyImageToClipboard() {
    await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        clipboardScriptPath,
        "-ImagePath",
        imagePath,
    ]);

    console.log("Image copied to clipboard");
}

async function downloadLatestImage() {
    const response = await fetch(`${apiUrl}/image`, {
        headers: {
            Authorization: `Bearer ${apiToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Image download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    await writeFile(imagePath, imageBuffer);

    console.log("Image saved as test-image.jpg");

    await copyImageToClipboard();
}

async function checkLatest() {
    try {
        const response = await fetch(`${apiUrl}/latest`, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const latest = await response.json();

        if (latest.available && latest.id !== lastImageId) {
            console.log("New image found:", latest.id);
            await downloadLatestImage();
            lastImageId = latest.id;
        }
    } catch (error) {
        console.error("Polling failed:", error.message);
    }
}

function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

console.log("Polling started");

while (true) {
    await checkLatest();
    await sleep(2000);
}