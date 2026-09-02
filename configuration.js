import {
	chmod,
	mkdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

function validateConfiguration(apiUrl, apiToken) {
	if (
		typeof apiUrl !== "string" ||
		typeof apiToken !== "string" ||
		!apiUrl.trim() ||
		!apiToken
	) {
		throw new Error("Worker URL and API token are required");
	}

	const normalizedApiUrl = apiUrl.trim().replace(/\/+$/, "");
	let parsedApiUrl;

	try {
		parsedApiUrl = new URL(normalizedApiUrl);
	} catch {
		throw new Error("Worker URL is not a valid URL");
	}

	if (
		parsedApiUrl.protocol !== "https:" &&
		parsedApiUrl.protocol !== "http:"
	) {
		throw new Error("Worker URL must use HTTP or HTTPS");
	}

	return {
		apiUrl: normalizedApiUrl,
		apiToken,
	};
}

export async function loadConfiguration(
	configurationFilePath,
	safeStorage
) {
	let configurationText;

	try {
		configurationText = await readFile(
			configurationFilePath,
			"utf8"
		);
	} catch (error) {
		if (error.code === "ENOENT") {
			return null;
		}

		throw error;
	}

	const storedConfiguration = JSON.parse(configurationText);
	const apiToken = safeStorage.decryptString(
		Buffer.from(
			storedConfiguration.encryptedApiToken,
			"base64"
		)
	);

	return validateConfiguration(
		storedConfiguration.apiUrl,
		apiToken
	);
}

export async function saveConfiguration(
	configurationFilePath,
	safeStorage,
	configuration
) {
	if (!safeStorage.isEncryptionAvailable()) {
		throw new Error("Secure token storage is not available");
	}
	if (
		process.platform === "linux" &&
		safeStorage.getSelectedStorageBackend() === "basic_text"
	) {
		throw new Error("A secure Linux keyring is not available");
	}

	const validatedConfiguration = validateConfiguration(
		configuration.apiUrl,
		configuration.apiToken
	);
	const encryptedApiToken = safeStorage.encryptString(
		validatedConfiguration.apiToken
	);
	const storedConfiguration = {
		version: 1,
		apiUrl: validatedConfiguration.apiUrl,
		encryptedApiToken: encryptedApiToken.toString("base64"),
	};

	await mkdir(dirname(configurationFilePath), {
		recursive: true,
	});
	await writeFile(
		configurationFilePath,
		JSON.stringify(storedConfiguration, null, "\t"),
		{
			encoding: "utf8",
			mode: 0o600,
		}
	);
	await chmod(configurationFilePath, 0o600);
}
