# iPhone Clipboard

Send a photo from an iPhone and automatically receive it in the Linux clipboard.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/waterfalleq/iphone-clipboard)

iPhone Clipboard is a small personal utility made of three parts:

1. an iPhone Shortcut uploads a photo;
2. a Cloudflare Worker stores the latest photo in a private R2 bucket;
3. an Ubuntu tray app detects the new photo and copies it to the clipboard.

The project currently supports **Ubuntu/Linux x64**. A Windows version is not available yet.

## Features

- Copy a newly uploaded iPhone photo to the desktop clipboard automatically.
- Keep running as a tray application.
- Show connection and last-copy status in the tray menu.
- Briefly change the tray icon after a successful copy.
- Retry temporary connection failures with an increasing delay.
- Configure the Worker URL and API token from a small settings window.
- Encrypt the saved API token with Electron's secure storage and the Linux keyring.
- Manually copy the latest available image from the tray menu.

## How it works

```text
iPhone Shortcut
      │ HTTPS upload
      ▼
Cloudflare Worker ──── private R2 bucket
      ▲
      │ checks for a new image
      │
Ubuntu tray app ──────► system clipboard
```

The R2 bucket contains only one object, `latest-image`. Each upload replaces the previous image.

## What you need

- An iPhone with the Shortcuts app.
- An Ubuntu/Linux x64 computer.
- A Cloudflare account with R2 enabled. R2 has an included free usage allowance, but Cloudflare may require you to complete its R2 subscription setup.
- A GitHub or GitLab account for Cloudflare to create your personal copy of the backend.

The desktop installer does not include a shared server. Each user deploys their own Worker and uses their own private API token.

## 1. Deploy your Cloudflare backend

### Create your API token

The API token is a private password shared by your Worker, iPhone Shortcut, and desktop app. Create it before starting the deployment.

The easiest method does not require a terminal:

1. Open the password generator in your password manager.
2. Generate a random password at least 32 characters long. Letters and numbers are sufficient; symbols are optional.
3. Save it in the password manager with a name such as `iPhone Clipboard API token`.

Alternatively, generate a 64-character token from a Linux or macOS terminal:

```bash
openssl rand -hex 32
```

Copy the complete result without adding quotation marks or spaces. Enter the token in these forms:

- Cloudflare `API_TOKEN`: the token by itself
- Desktop Settings → **API token**: the token by itself
- Shortcut `Authorization` header: `Bearer ` followed by the token

For example, if the token were `your-private-token`, the Shortcut header would be `Bearer your-private-token`. This is only a formatting example; do not use that text as your real token.

Select the button below:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/waterfalleq/iphone-clipboard)

Cloudflare will guide you through the remaining steps:

1. Sign in to Cloudflare.
2. Connect a GitHub or GitLab account so Cloudflare can create your personal copy of the backend repository.
3. Confirm the Worker and R2 bucket names.
4. Enter your saved random token as `API_TOKEN`.
5. Deploy the project.

Cloudflare automatically creates a private R2 bucket, connects it to the Worker, stores the token as an encrypted secret, and deploys the Worker in your account. Your images and secret are not stored in the original project's Cloudflare account.

When deployment finishes, copy the Worker URL. It normally looks like:

```text
https://iphone-clipboard.<your-subdomain>.workers.dev
```

Save both the Worker URL and the token. Cloudflare does not show a saved secret's value again. If you lose the token, you will need to replace it in Cloudflare, the Shortcut, and the desktop app.

If you prefer to deploy from a terminal, see [Manual backend deployment](#manual-backend-deployment).

## 2. Create the iPhone Shortcut

Create a new Shortcut with these actions:

1. **Take Photo**
2. **Resize Image**
   - Width: `1600`
   - Height: `Auto`
3. **Get Contents of URL**
   - URL: `<your-worker-url>/upload` (for example, `https://iphone-clipboard.example.workers.dev/upload`)
   - Method: `POST`
   - Request Body: `Form`
   - Add a file field named `image`
   - Set its value to the resized image from step 2
   - Add the header `Authorization`
   - Set its value to `Bearer <your-api-token>`
4. **Show Notification** with a message such as `Sent`

Run the Shortcut once and allow any permissions requested by iOS.

Do not publish or share a configured Shortcut: it contains the API token. If you want to share the workflow, remove the real Worker URL and token first.

## 3. Install the Ubuntu app

Download the current `.deb` installer from the [GitHub Releases page](https://github.com/waterfalleq/iphone-clipboard/releases). Then install it with your software installer or from a terminal:

```bash
sudo apt install ./iphone-clipboard_<version>_amd64.deb
```

Launch **iPhone Clipboard** from the applications menu. On first launch:

1. open the tray icon's menu;
2. select **Settings**;
3. enter the Worker URL and API token from the backend setup;
4. select **Test connection**.

A successful test also saves the settings and starts polling. The token is encrypted through Electron's secure storage; on Linux this requires a working system keyring such as GNOME Keyring.

Now run the iPhone Shortcut. Within a few seconds, the photo should be available to paste on the computer.

## Tray menu

- **Status** shows whether the app is connecting, waiting, downloading, or has encountered an error.
- **Last copied** shows the last successful copy time in the current session.
- **Settings** opens the Worker URL and token form.
- **Copy latest now** downloads the current image even if it was already seen.
- **Quit** closes the tray app.

## Development

You need [Node.js](https://nodejs.org/) 22.12 or newer to develop, deploy manually, or build the project.

Install dependencies:

```bash
npm install
```

Run the Worker locally:

```bash
npm run dev
```

Run the desktop app from the source tree:

```bash
npm run desktop
```

The source version uses the same Settings window as the installed application. `.dev.vars` is for the local Worker and deployment only; it is not read by the desktop app.

## Manual backend deployment

The Deploy to Cloudflare button is the recommended setup. These commands provide the equivalent manual process.

Clone the repository and install its dependencies:

```bash
git clone https://github.com/waterfalleq/iphone-clipboard.git
cd iphone-clipboard
npm install
```

Sign in to Cloudflare and create the R2 bucket expected by `wrangler.jsonc`:

```bash
npx wrangler login
npx wrangler r2 bucket create iphone-clipboard-images
```

Create a local secrets file and generate a random token:

```bash
cp .dev.vars.example .dev.vars
openssl rand -hex 32
```

Open `.dev.vars` and replace the example value with the generated token:

```dotenv
API_TOKEN=your-random-token
```

Deploy the Worker and upload the token as a Cloudflare secret:

```bash
npm run deploy -- --secrets-file .dev.vars
```

Keep `.dev.vars` private. It is ignored by Git and is never read by the desktop app.

Cloudflare references: [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/), [R2 bucket creation](https://developers.cloudflare.com/r2/get-started/cli/), and [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Build the Ubuntu installer

Install the Debian packaging tool once:

```bash
sudo apt install fakeroot
```

Build the package:

```bash
npm run make
```

The installer is created under:

```text
out/make/deb/x64/
```

Build output is intentionally excluded from Git. Release installers should be attached to a GitHub Release instead of committed to the repository.

## Project structure

```text
src/index.js          Cloudflare Worker API
wrangler.jsonc        Worker and R2 configuration
desktop.js            Electron tray application
configuration.js      validation and encrypted settings storage
settings.*            settings window
assets/               tray icons
forge.config.cjs      Ubuntu packaging configuration
packaging/            Linux desktop-entry template
```

## License

This project is available under the [ISC License](LICENSE).
