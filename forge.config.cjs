const path = require("node:path");

const runtimePaths = new Set([
	"/assets",
	"/assets/tray-icon.png",
	"/assets/tray-icon-success.png",
	"/configuration.js",
	"/desktop.js",
	"/package.json",
	"/settings-preload.cjs",
	"/settings.css",
	"/settings.html",
	"/settings.js",
]);

module.exports = {
	packagerConfig: {
		asar: true,
		ignore: (filePath) => {
			if (!filePath) {
				return false;
			}

			return !runtimePaths.has(filePath);
		},
	},
	makers: [
		{
			name: "@electron-forge/maker-deb",
			config: {
				options: {
					maintainer: "waterfalleq",
					homepage:
						"https://github.com/waterfalleq/iphone-clipboard",
					icon: path.resolve(
						__dirname,
						"assets/tray-icon.png"
					),
					categories: ["Utility"],
					desktopTemplate: path.resolve(
						__dirname,
						"packaging/desktop.ejs"
					),
				},
			},
		},
	],
};
