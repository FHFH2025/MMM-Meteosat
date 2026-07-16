# MMM-Meteosat

[![MagicMirror²](https://img.shields.io/badge/MagicMirror²-Module-blue.svg)](https://magicmirror.builders/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.3%2B-brightgreen.svg)](https://nodejs.org/)

High-quality **near-real-time Meteosat Third Generation (MTG)** satellite imagery for **MagicMirror²**, downloaded directly from the **official EUMETSAT Data Store**.

The module automatically authenticates with your EUMETSAT account, downloads the latest Full Disk RGB quicklook, removes the background to create a transparent image, caches it locally and displays it on your MagicMirror.

---

## Screenshot

<img src="docs/screenshot.png" alt="MMM-Meteosat displaying an MTG full-disk image" width="600">

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Obtaining EUMETSAT Credentials](#obtaining-eumetsat-credentials)
- [Configuration](#configuration)
- [Background Processing Options](#background-processing-options)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Updating](#updating)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Features

- Official EUMETSAT Data Store support
- Automatic OAuth authentication
- Automatic retrieval of the newest MTG Full Disk RGB image
- Automatic background removal with transparent PNG output
- Local image cache to minimise network traffic
- Configurable update interval
- Configurable image size
- Optional acquisition timestamp
- Optional status messages
- Automatic cache refresh when a newer image becomes available

---

## Why this module?

Many existing satellite image modules rely on third-party web pages or manually maintained image URLs.

MMM-Meteosat instead downloads imagery directly from the **official EUMETSAT Data Store**, ensuring:

- reliable long-term availability,
- official satellite imagery,
- consistent image quality,
- transparent licensing,
- no dependency on external weather websites.

---

## Requirements

Before installing the module, ensure you have:

- MagicMirror²
- Node.js 20.3 or newer
- npm
- an EUMETSAT account
- an active **Meteosat < 1 hr latency** licence

---

## Installation

Clone the repository into your MagicMirror modules directory.

```bash
cd ~/MagicMirror/modules
git clone https://github.com/FHFH2025/MMM-Meteosat.git
```

Change into the module directory.

```bash
cd MMM-Meteosat
```

Install all required Node.js packages.

```bash
npm install
```

After the installation has finished, add the module to your `config.js`.

A minimal configuration looks like this:

```javascript
{
    module: "MMM-Meteosat",
    position: "top_right",

    config: {
        consumerKey: "YOUR_CONSUMER_KEY",
        consumerSecret: "YOUR_CONSUMER_SECRET"
    }
}
```

Additional configuration options are described later in this document.

---

## Quick Start

1. Install the module.
2. Create an EUMETSAT account.
3. Activate the required licence.
4. Obtain your Consumer Key and Consumer Secret.
5. Add both values to your MagicMirror configuration.
6. Start MagicMirror².

The following section explains these steps in detail.

## Obtaining EUMETSAT Credentials

> [!NOTE]
> **Estimated setup time:** approximately **5–10 minutes**
>
> Creating an EUMETSAT account is free of charge. For personal MagicMirror installations, the required licence is typically activated immediately after accepting the licence terms.

To download satellite imagery, the module requires access to the official **EUMETSAT Data Store**.

Authentication is performed using a permanent **Consumer Key** and **Consumer Secret**, which are linked to your personal EUMETSAT account.

> [!IMPORTANT]
> The **API Token** shown on the EUMETSAT website is **not** used by this module.
>
> It is only a temporary access token (typically valid for about one hour). The module automatically creates and refreshes these tokens whenever necessary.

---

### Step 1 – Create an EUMETSAT account

If you do not already have an account, register here:

https://user.eumetsat.int/

After registering:

1. Verify your email address.
2. Sign in to your account.

---

### Step 2 – Request the required licence

Some EUMETSAT datasets are freely accessible, while others require acceptance of a licence agreement.

This module requires access to the following licence:

```text
Meteosat < 1 hr latency
```

#### Open the licence page

After signing in, open your account and navigate to:

**My Data Licences**

Request the licence:

```text
Meteosat < 1 hr latency
```

#### Choose the correct usage type

For most private MagicMirror installations, select:

- Personal Use

or, if applicable:

- Educational Use
- Research Project

Commercial users should choose the licence type appropriate for their intended use.

#### Accept the licence agreement

Read the licence terms carefully and accept them.

Once activated, the licence should appear as:

```text
Status: Active
```

The activation is usually immediate.

---

### Step 3 – Open API Key Management

Open the EUMETSAT API Key Management page:

https://api.eumetsat.int/api-key/

Log in using the **same account** for which the licence was activated.

The page displays three values:

- Consumer Key
- Consumer Secret
- API Token

Example:

```text
Consumer Key
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Consumer Secret
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

API Token
eyJhbGciOi...
```

Only the first two values are required.

Do **not** copy the API Token into your MagicMirror configuration.

---

### Step 4 – Configure the module

Open your `config.js` and enter the Consumer Key and Consumer Secret.

Example:

```javascript
{
    module: "MMM-Meteosat",
    position: "top_right",

    config: {
        consumerKey: "YOUR_CONSUMER_KEY",
        consumerSecret: "YOUR_CONSUMER_SECRET"
    }
}
```

Restart MagicMirror after saving the configuration.

---

### How authentication works

The module never stores your EUMETSAT password.

Instead, it performs the following steps:

1. Authenticate using the Consumer Key and Consumer Secret.
2. Request a temporary OAuth access token.
3. Download the newest satellite product.
4. Discard the temporary token.
5. Repeat the process when the token expires.

No manual token handling is required.

---

### Credential security

Your Consumer Key and Consumer Secret remain on your local MagicMirror installation.

Never:

- publish them on GitHub,
- include them in screenshots,
- post them in issue reports,
- share them with other users.

If you accidentally expose your credentials, revoke them in the EUMETSAT portal and create a new key pair.

---

### Data licensing

The source code of this module is released under the **MIT License**.

Satellite imagery itself is **not** covered by the MIT License.

All downloaded imagery remains subject to the applicable EUMETSAT Data Policy and licence terms.

Before using the imagery in public, educational or commercial environments, ensure that your intended use complies with the selected EUMETSAT licence.

---

### Credential troubleshooting

#### EUMETSAT authentication failed

Verify that:

- the Consumer Key is correct,
- the Consumer Secret is correct,
- both values belong to the same EUMETSAT account.

---

#### No products found

Ensure that:

- the licence **Meteosat < 1 hr latency** is active,
- you are logged into the correct EUMETSAT account,
- the licence has already been activated.

---

#### I only have an API Token

You are looking at the correct page.

However, the module does **not** use the displayed API Token.

Instead, copy:

- Consumer Key
- Consumer Secret

The module automatically generates its own temporary access tokens.

---

#### Which licence do I need?

For almost all private MagicMirror installations:

```text
Meteosat < 1 hr latency
Personal Use
```

is the correct choice.

Educational institutions and research projects should select the corresponding licence category.

Commercial users should review the applicable EUMETSAT licensing conditions before using the imagery.

---

### Further information

EUMETSAT User Portal

https://user.eumetsat.int/

API Key Management

https://api.eumetsat.int/api-key/

EUMETSAT Data Store

https://data.eumetsat.int/

## Configuration

Add the module to your MagicMirror² `config/config.js`.

```javascript
{
    module: "MMM-Meteosat",
    position: "top_right",

    config: {
        consumerKey: "YOUR_EUMETSAT_CONSUMER_KEY",
        consumerSecret: "YOUR_EUMETSAT_CONSUMER_SECRET",

        imageSize: 550,
        updateInterval: 10 * 60 * 1000,

        showTimestamp: true,
        showSource: true,
        showStatus: true,

        loadingText: "Loading Meteosat image …",

        backgroundThreshold: 195,
        backgroundTolerance: 45,
        edgeRemovalPixels: 3,
        edgeFeatherPixels: 2
    }
}
```

> [!IMPORTANT]
> Replace the example credentials with your own EUMETSAT Consumer Key and Consumer Secret.
>
> Never commit your real credentials to a public Git repository.

After editing `config.js`, restart MagicMirror².

---

## Minimal Configuration

Only the credentials are mandatory:

```javascript
{
    module: "MMM-Meteosat",
    position: "top_right",

    config: {
        consumerKey: "YOUR_EUMETSAT_CONSUMER_KEY",
        consumerSecret: "YOUR_EUMETSAT_CONSUMER_SECRET"
    }
}
```

All other settings use the defaults listed below.

---

## Configuration Options

| Option | Type | Default | Description |
|---|---|---:|---|
| `consumerKey` | string | `""` | EUMETSAT Consumer Key used to request temporary access tokens. |
| `consumerSecret` | string | `""` | EUMETSAT Consumer Secret associated with the Consumer Key. |
| `imageSize` | number | `550` | Display width of the satellite image in pixels. |
| `updateInterval` | number | `600000` | Interval between update checks in milliseconds. The minimum accepted value is five minutes. |
| `showTimestamp` | boolean | `true` | Shows the acquisition timestamp below the image. |
| `showSource` | boolean | `true` | Adds `EUMETSAT` to the caption when the timestamp is visible. |
| `showStatus` | boolean | `true` | Shows loading and error messages when no image is available. |
| `loadingText` | string | `"Loading Meteosat image …"` | Text displayed while the first image is being loaded. |
| `backgroundThreshold` | number | `195` | Minimum channel brightness used when detecting the connected light background. |
| `backgroundTolerance` | number | `45` | Maximum permitted difference between RGB channels for a background candidate. |
| `edgeRemovalPixels` | number | `3` | Number of pixels removed inside the detected background boundary. |
| `edgeFeatherPixels` | number | `2` | Width of the soft transparency transition at the Earth limb. |

---

## Recommended Configuration

The following settings provide a balanced result for most MagicMirror² installations:

```javascript
{
    module: "MMM-Meteosat",
    position: "top_right",

    config: {
        consumerKey: "YOUR_EUMETSAT_CONSUMER_KEY",
        consumerSecret: "YOUR_EUMETSAT_CONSUMER_SECRET",

        imageSize: 550,
        updateInterval: 10 * 60 * 1000,

        showTimestamp: true,
        showSource: true,
        showStatus: true,

        loadingText: "Loading Meteosat image …",

        backgroundThreshold: 195,
        backgroundTolerance: 45,
        edgeRemovalPixels: 3,
        edgeFeatherPixels: 2
    }
}
```

> [!TIP]
> A ten-minute refresh interval matches the usual publication interval of the MTG Full Disk RGB
> quicklook. Shorter intervals normally do not provide newer imagery and only increase API traffic.

---

## Hiding the Caption

To hide the complete caption below the image:

```javascript
showTimestamp: false
```

When `showTimestamp` is disabled, the `showSource` option has no visible effect.

---

## Custom Loading Text

The loading message can be localised directly in `config.js`.

English:

```javascript
loadingText: "Loading Meteosat image …"
```

German:

```javascript
loadingText: "Meteosat-Bild wird geladen …"
```

French:

```javascript
loadingText: "Chargement de l’image Meteosat …"
```

Any plain-text value can be used.

---

## Changing the Image Size

The `imageSize` value controls the rendered width in pixels.

Example:

```javascript
imageSize: 400
```

The image keeps its original aspect ratio.

> [!TIP]
> Use CSS for layout-specific adjustments such as margins or alignment. Use `imageSize` only for
> the base display width.

---

## Background Processing Options

The EUMETSAT RGB quicklook contains a light background around the Earth disc.

MMM-Meteosat removes only the light background that is connected to the outer border of the
image. Bright clouds and other light areas inside the Earth disc are therefore preserved.

### `backgroundThreshold`

Defines how bright a pixel must be before it can be considered part of the background.

Lower values detect darker edge pixels but may remove more of the Earth limb.

Example:

```javascript
backgroundThreshold: 195
```

### `backgroundTolerance`

Defines how much the red, green and blue channels may differ.

A higher value also detects slightly coloured JPEG edge artefacts.

Example:

```javascript
backgroundTolerance: 45
```

### `edgeRemovalPixels`

Expands the detected background mask slightly into the image.

This removes residual bright edge pixels and JPEG artefacts.

Example:

```javascript
edgeRemovalPixels: 3
```

### `edgeFeatherPixels`

Creates a soft alpha transition between the transparent background and the visible Earth disc.

Example:

```javascript
edgeFeatherPixels: 2
```

> [!WARNING]
> Very aggressive values can remove visible pixels from the Earth limb.
>
> Change the processing settings gradually and delete the generated cache image before evaluating
> the result.

Recommended defaults:

```javascript
backgroundThreshold: 195,
backgroundTolerance: 45,
edgeRemovalPixels: 3,
edgeFeatherPixels: 2
```

---

## Regenerating the Processed Image

If you change the background-processing settings, remove the current generated image and status file.

From the module directory:

```bash
rm -f \
  cache/latest.png \
  cache/status.json
```

Restart MagicMirror² afterwards.

The original downloaded quicklook may remain in place. The module will regenerate the transparent
PNG during the next successful update.

To force a complete new download as well:

```bash
rm -f \
  cache/latest.png \
  cache/latest-source.jpg \
  cache/status.json
```

---

## How It Works

MMM-Meteosat performs the following sequence:

1. Receives the module configuration from the MagicMirror² frontend.
2. Authenticates against EUMETSAT using the Consumer Key and Consumer Secret.
3. Requests a temporary OAuth access token.
4. Searches the latest official Meteosat Third Generation Full Disk product.
5. Selects the RGB1 quicklook image from that product.
6. Downloads the quicklook image.
7. Detects the light background connected to the image border.
8. Removes the background and softens the Earth limb.
9. Writes the result as a transparent PNG.
10. Stores product metadata in the local cache.
11. Notifies the MagicMirror² frontend that a newer image is available.
12. Keeps the cached image visible if a later update fails.

---

## Processing Flow

```text
EUMETSAT account
        │
        ▼
Consumer Key + Consumer Secret
        │
        ▼
Temporary OAuth access token
        │
        ▼
Search newest MTG FCI product
        │
        ▼
Download RGB1 quicklook
        │
        ▼
Detect connected light background
        │
        ▼
Create transparent PNG
        │
        ▼
Store local cache
        │
        ▼
Display in MagicMirror²
```

---

## EUMETSAT Product

The module currently downloads the official **Meteosat Third Generation Full Disk RGB quicklook** provided through the EUMETSAT Data Store.

Support for additional EUMETSAT products may be added in future releases.

---

## Local Cache

Runtime files are stored in the module's `cache` directory.

```text
cache/
├── latest-source.jpg
├── latest.png
└── status.json
```

### `latest-source.jpg`

The original RGB quicklook downloaded from EUMETSAT.

### `latest.png`

The processed image with transparent background displayed by MagicMirror².

### `status.json`

Metadata about the current product and the processing settings used to create the image.

Example:

```json
{
  "productId": "W_XX-EUMETSAT-...",
  "entry": "W_XX-EUMETSAT-...RGB1....jpg",
  "sensingStart": "2026-07-15T10:50:07Z",
  "sensingEnd": "2026-07-15T10:59:39Z",
  "displayTime": "15.07.2026, 12:59",
  "downloadedAt": "2026-07-15T11:09:38.000Z",
  "source": "EUMETSAT",
  "imageFile": "cache/latest.png",
  "sourceFile": "cache/latest-source.jpg",
  "processing": {
    "backgroundThreshold": 195,
    "backgroundTolerance": 45,
    "edgeRemovalPixels": 3,
    "edgeFeatherPixels": 2
  }
}
```

The exact timestamps and product identifiers naturally change with each update.

---

## Cache Behaviour

Before downloading a new image, the module compares the newest EUMETSAT product with the locally
cached product ID.

If both IDs match:

- the image is not downloaded again,
- the existing PNG remains visible,
- the frontend receives an unchanged-image notification.

If the EUMETSAT request fails but a cached image exists:

- the cached image remains visible,
- the error is written to the MagicMirror² log,
- the module retries during the next scheduled update.

> [!NOTE]
> The cache allows the module to remain useful during temporary API, network or EUMETSAT service
> interruptions.

---

## Update Behaviour

The default update interval is:

```javascript
10 * 60 * 1000
```

which equals:

```text
600000 milliseconds
10 minutes
```

The module enforces a minimum interval of five minutes.

Values below this limit are automatically raised to the minimum.

Example for a 15-minute interval:

```javascript
updateInterval: 15 * 60 * 1000
```

---

## Log Output

The module writes operational messages to the standard MagicMirror² log.

Typical messages include:

```text
[MMM-Meteosat] Node helper started.
[MMM-Meteosat] Update interval: 600000 ms
[MMM-Meteosat] Checking EUMETSAT for a new image.
[MMM-Meteosat] The newest image is already cached.
[MMM-Meteosat] Image updated: <product ID>
```

Errors are also logged with the module name so they can be filtered easily.

Inspect your MagicMirror² log using the logging method appropriate for your installation.

---

## Troubleshooting

### No image is displayed

Verify the following:

- Your MagicMirror² installation is running.
- The module has been added correctly to `config.js`.
- Your Consumer Key and Consumer Secret are valid.
- The required EUMETSAT licence is active.
- Internet access is available.

Inspect the MagicMirror² log for details.

---

### Authentication failed

Possible causes include:

- incorrect Consumer Key
- incorrect Consumer Secret
- inactive EUMETSAT licence
- credentials copied from another account

Verify your credentials in the EUMETSAT API Key Management portal.

---

### The image is not updating

The module only downloads a new image if a newer product is available.

If the latest EUMETSAT product has not changed, the cached image remains displayed.

To force a complete refresh:

```bash
rm -f cache/latest.png
rm -f cache/latest-source.jpg
rm -f cache/status.json
```

Restart MagicMirror² afterwards.

---

### The Earth still has a bright edge

Adjust one or more of the following settings:

```javascript
backgroundThreshold
backgroundTolerance
edgeRemovalPixels
edgeFeatherPixels
```

Small adjustments usually produce the best results.

---

### I changed the processing parameters but nothing changed

Delete the cached image.

```bash
rm cache/latest.png
```

The module regenerates the transparent PNG during the next successful update.

---

## FAQ

### Does this module use the official EUMETSAT Data Store?

Yes.

All imagery is obtained directly from the official EUMETSAT Data Store using OAuth authentication.

---

### Does the module scrape websites?

No.

The module communicates only with the official EUMETSAT APIs.

---

### Is an API Token required?

No.

Only the Consumer Key and Consumer Secret are required.

Temporary OAuth tokens are generated automatically.

---

### Can I use another satellite product?

Not yet.

The current release is intentionally focused on the MTG Full Disk RGB quicklook.

Support for additional EUMETSAT products is planned for future versions.

---

### Can I use this module commercially?

The module itself is released under the MIT License.

The downloaded satellite imagery remains subject to the applicable EUMETSAT licence terms.

Please review the EUMETSAT licence before commercial use.

---

## Updating

To update the module:

```bash
cd ~/MagicMirror/modules/MMM-Meteosat

git pull

npm install
```

Restart MagicMirror² afterwards.

---

## Repository Layout

```text
MMM-Meteosat
├── cache/
├── docs/
├── LICENSE
├── MMM-Meteosat.css
├── MMM-Meteosat.js
├── node_helper.js
├── package.json
├── package-lock.json
└── README.md
```

---

## Roadmap

### Version 1.x

- [x] Official EUMETSAT Data Store support
- [x] OAuth authentication
- [x] Automatic product detection
- [x] Transparent background generation
- [x] Local image cache
- [x] Configurable processing parameters
- [x] Automatic update detection

### Planned

- [ ] Additional MTG RGB products
- [ ] Infrared imagery
- [ ] Air Mass RGB
- [ ] Dust RGB
- [ ] Water Vapour imagery
- [ ] Optional image labels
- [ ] Optional image effects
- [ ] Optional image overlays

---

## Contributing

Contributions are welcome.

Bug reports, feature requests and pull requests are greatly appreciated.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.

---

## Security

> [!WARNING]
> Never publish your Consumer Key or Consumer Secret.

If your credentials become public:

1. Revoke them in the EUMETSAT API Key Management portal.
2. Generate a new key pair.
3. Update your `config.js`.

---

## Credits

Satellite imagery provided by:

**EUMETSAT – European Organisation for the Exploitation of Meteorological Satellites**

https://www.eumetsat.int/

MagicMirror²:

https://magicmirror.builders/

Image processing:

- sharp
- Node.js

---

## License

This project is licensed under the MIT License.

See the [LICENSE](LICENSE) file for details.

---

## Data Attribution

Satellite imagery is **not** covered by the MIT License.

All imagery remains the property of EUMETSAT and is distributed under the applicable EUMETSAT Data Policy and licence terms.

Users are responsible for ensuring that their use of the imagery complies with the selected licence.

---

## Support

If you encounter a problem:

1. Update to the latest version.
2. Read the Troubleshooting section.
3. Search the existing GitHub Issues.
4. Open a new issue if the problem persists.

When reporting an issue, please include:

- MagicMirror² version
- Node.js version
- operating system
- module version
- relevant log output

Please **never** include your Consumer Key or Consumer Secret in issue reports.

---

If you find this module useful, consider giving the repository a ⭐ on GitHub.
