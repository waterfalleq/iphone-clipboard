import { spawn } from "node:child_process";
import { resolve } from "node:path";


const clipboardScriptPath = resolve("clipboard-windows.ps1");

const apiUrl = process.env.API_URL;
const apiToken = process.env.API_TOKEN;

if (!apiUrl || !apiToken) {
    throw new Error("API_URL and API_TOKEN are required");
}

let lastImageId = null;

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

    await copyImageToClipboard(imageBuffer);
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