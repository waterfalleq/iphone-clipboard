const form = document.querySelector("#settings-form");
const apiUrlInput = document.querySelector("#api-url");
const apiTokenInput = document.querySelector("#api-token");
const testButton = document.querySelector("#test-button");
const result = document.querySelector("#result");

function showResult(message, resultType = "") {
	result.textContent = message;
	result.className = resultType;
}

async function loadSettings() {
	try {
		const configuration = await window.settingsApi.load();

		apiUrlInput.value = configuration.apiUrl;
		apiTokenInput.value = configuration.apiToken;
	} catch (error) {
		showResult(error.message, "error");
	}
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	testButton.disabled = true;
	showResult("Testing connection…");

	try {
		const testResult = await window.settingsApi.testAndSave({
			apiUrl: apiUrlInput.value,
			apiToken: apiTokenInput.value,
		});

		if (testResult.success) {
			apiUrlInput.value = testResult.apiUrl;
			showResult(testResult.message, "success");
		} else {
			showResult(testResult.message, "error");
		}
	} catch (error) {
		showResult(error.message, "error");
	} finally {
		testButton.disabled = false;
	}
});

loadSettings();
