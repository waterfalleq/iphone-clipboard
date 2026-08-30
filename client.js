import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const clipboardScriptPath = resolve("clipboard-windows.ps1");
const stateFilePath = resolve(".client-state.json");

const apiUrl = process.env.API_URL;
const apiToken = process.env.API_TOKEN;

if (!apiUrl || !apiToken) {
    throw new Error("API_URL and API_TOKEN are required");
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

let lastImageId = await loadLastImageId();

function copyImageToClipboard(imageBuffer) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn("powershell.exe", [
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            clipboardScriptPath,
        ], {
            stdio: ["pipe", "ignore", "pipe"],
        });

        let errorOutput = "";

        child.stderr.setEncoding("utf8");

        child.stderr.on("data", (chunk) => {
            errorOutput += chunk;
        });

        child.on("error", reject);

        child.on("close", (exitCode) => {
            if (exitCode === 0) {
                console.log("Image copied to clipboard");
                resolvePromise();
                return;
            }

            reject(
                new Error(
                    `Clipboard process failed: ${errorOutput.trim()}`
                )
            );
        });

        child.stdin.end(imageBuffer.toString("base64"));
    });
}

async function downloadLatestImage() {
    console.time("  Image download");

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

    console.timeEnd("  Image download");
    console.time("  Windows clipboard");

    await copyImageToClipboard(imageBuffer);

    console.timeEnd("  Windows clipboard");
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
            console.time("Download and clipboard");
            await downloadLatestImage();
            console.timeEnd("Download and clipboard");
            lastImageId = latest.id;
            await saveLastImageId(lastImageId);
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
