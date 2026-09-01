import { spawn } from "node:child_process";
import electronPath from "electron";

const electronArguments = process.platform === "linux"
	? ["--ozone-platform=x11", "."]
	: ["."];

const electronProcess = spawn(
	electronPath,
	electronArguments,
	{ stdio: "inherit" }
);

electronProcess.on("exit", (exitCode) => {
	process.exit(exitCode ?? 1);
});
