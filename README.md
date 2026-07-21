# MMM-Meteosat

Near-real-time Meteosat Third Generation (MTG) satellite imagery for MagicMirror², obtained directly from the official EUMETSAT EUMETView WMS service.

## Features

- Current MTG full-disk imagery from EUMETSAT
- Eight selectable satellite products
- GeoColour as the default all-day product
- Transparent background for dark MagicMirror layouts
- Separate cache for every module instance and product
- Local fallback when an update temporarily fails
- Configurable display size and source-image resolution
- Optional source, product and timestamp caption

## Screenshot

![MMM-Meteosat screenshot](docs/screenshot.png)

## Requirements

- MagicMirror²
- Node.js 20.3.0 or newer
- Internet access from the MagicMirror host to EUMETView

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/FHFH2025/MMM-Meteosat.git
cd MMM-Meteosat
npm install
```

Restart MagicMirror² after installation.

## Quick start

```js
{
  module: "MMM-Meteosat",
  position: "top_right",
  config: {
    product: "geocolour"
  }
}
```

GeoColour is the default product. It provides a natural-looking daytime image and incorporates infrared information at night, so clouds remain visible around the clock.

## Products

The module supports eight EUMETSAT WMS products.

| Value | What it shows | Best suited for |
|---|---|---|
| `geocolour` | Natural colours by day and an infrared-enhanced view at night. | Recommended general everyday use. |
| `dust` | Highlights airborne dust, especially large Saharan dust plumes. Colours are specialised and are not intended to look natural. | Tracking dust moving across Africa, the Atlantic and Europe. |
| `cloudphase` | Helps distinguish different cloud properties, such as thick ice clouds, water clouds and thinner cloud areas. | A more detailed look at cloud structure. |
| `cloudtype` | Classifies clouds into different types rather than showing a natural-colour photograph. | Comparing high, low, thick and thin cloud areas. |
| `fog` | Emphasises fog and low cloud, especially when they are difficult to separate from the ground in ordinary imagery. | Night-time and early-morning fog monitoring. |
| `firetemperature` | Highlights exceptionally hot areas that may be associated with active fires. | Observing large wildfires and other strong heat sources. |
| `snow` | Makes snow-covered land easier to distinguish from clouds. | Following snow cover during daylight. |
| `infrared` | A pure 10.5 µm infrared view. Colder, high cloud tops stand out and the image works equally well by day and night. | Continuous cloud monitoring and night-time use. |

### Why some products do not show a complete globe

Some specialised products may show only part of the Earth disc, may contain blank sections, or may look less complete than GeoColour. This is normal. These products are created for particular weather conditions, times of day or measurement methods, and EUMETSAT only displays areas where the relevant information is available and meaningful. MMM-Meteosat preserves the source image and does not remove those areas.

## Configuration

```js
{
  module: "MMM-Meteosat",
  position: "top_right",
  config: {
    product: "geocolour",
    cacheId: "",
    imageSize: 550,
    wmsImageSize: 1800,
    updateInterval: 10 * 60 * 1000,
    showTimestamp: true,
    timestampType: "acquisition",
    timestampLocale: "de-DE",
    timestampOptions: {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    },
    showSource: true,
    showProduct: true,
    showStatus: true,
    logLevel: "INFO",
    staleAfter: 90 * 60 * 1000,
    retryDelays: [15 * 1000, 45 * 1000],
    messages: {
      loading: "Loading Meteosat image …",
      noImage: "No Meteosat image is available yet.",
      error: "Meteosat image could not be loaded."
    }
  }
}
```

| Option | Type | Default | Description |
|---|---|---:|---|
| `product` | string | `"geocolour"` | Product selection listed above. |
| `cacheId` | string | `""` | Optional custom cache-folder name. Normally leave empty. Values are converted to lowercase and characters other than letters, numbers, `_` and `-` are replaced with `-`. |
| `imageSize` | number | `550` | Display width in pixels. |
| `wmsImageSize` | number | `1800` | Downloaded source-image width and height. Accepted range: 600–3600 pixels. |
| `updateInterval` | number | `600000` | Update interval in milliseconds. Values below five minutes are raised to five minutes. |
| `showTimestamp` | boolean | `true` | Shows the selected timestamp in the caption. |
| `timestampType` | string | `"acquisition"` | `"acquisition"` shows the latest acquisition time reported by the WMS capabilities. `"download"` shows the local download time. If no acquisition time is available, the download time is used as a fallback. |
| `timestampLocale` | string | system locale | Locale passed to `Intl.DateTimeFormat`, for example `"de-DE"` or `"en-GB"`. Leave undefined to use the browser locale. |
| `timestampOptions` | object | date and time, minutes | Options passed to `Intl.DateTimeFormat`. This can control date fields, time fields, 12/24-hour display, time zone and time-zone name. |
| `showSource` | boolean | `true` | Shows EUMETSAT in the caption. |
| `showProduct` | boolean | `true` | Shows the selected product name in the caption. |
| `showStatus` | boolean | `true` | Shows status messages while no image is available. |
| `logLevel` | string | `"INFO"` | Log level: `ERROR`, `WARN`, `INFO` or `DEBUG`. |
| `staleAfter` | number | `5400000` | Writes a warning when the latest acquisition is older than this number of milliseconds. Set to `0` to disable the warning. |
| `retryDelays` | number[] | `[15000, 45000]` | Delays before retrying temporary network, timeout, HTTP 429 or HTTP 5xx failures. At most five entries are used; each delay is capped at five minutes. Use `[]` to disable retries. |
| `messages.loading` | string | `"Loading Meteosat image …"` | Message shown while the first image is being requested. |
| `messages.noImage` | string | `"No Meteosat image is available yet."` | Message shown when no cached or newly downloaded image is available yet. |
| `messages.error` | string | `"Meteosat image could not be loaded."` | Message shown after an image download or processing error. Technical details remain in the MagicMirror log. |

The three message texts can be changed independently. `showStatus: false` hides all of them. Technical error details are never displayed on the mirror and are written only to the MagicMirror log.

## Multiple module instances and cache folders

Every module instance receives a separate cache folder, including the first instance. MagicMirror identifiers such as `module_3_MMM-Meteosat` are shortened automatically:

```text
cache/m3/geocolour/
cache/m4/infrared/
```

This prevents collisions when another instance is added later.

A stable custom name can be selected when required:

```js
config: {
  product: "geocolour",
  cacheId: "Living Room"
}
```

The custom value is normalised, producing:

```text
cache/living-room/geocolour/
```

Each product folder contains:

```text
source.png
latest.png
status.json
```

- `source.png` is the most recently downloaded WMS image.
- `latest.png` is the processed image displayed by MagicMirror².
- `status.json` stores the requested and resolved product, product label, WMS layer, source, SHA-256 content hash, acquisition time, WMS response time, download time, relative file paths and image-processing information.

If the newest downloaded image has the same SHA-256 hash as the cached source and `latest.png` exists, the module keeps the existing processed image. If an update fails, an existing `latest.png` remains available as the local fallback.

## Image processing

The module downloads the original satellite image from the official EUMETView WMS service and generates a transparent image by applying a geometric full-disk mask. The resulting image has clean, consistent edges and is optimized for display in MagicMirror².

## Runtime safety limits

The node helper limits WMS images to 40 MiB, capabilities documents to 5 MiB and decoded input images to 3600 × 3600 pixels. Reconfiguration aborts obsolete network requests, and temporary files use unique names and are removed after failures. A maximum of ten module instances is accepted by one node helper process.

## Troubleshooting

### No image appears

- Confirm that the MagicMirror host has Internet access.
- Check that `product` contains one of the documented values.
- Inspect the MagicMirror log for an HTTP or image-processing error.
- Keep the default `wmsImageSize` while testing.

### A specialised product looks incomplete

This is often expected. Read [Why some products do not show a complete globe](#why-some-products-do-not-show-a-complete-globe). Compare the result with `geocolour` before assuming that the image was cropped by the module.

### Clear one cached product

Stop MagicMirror², change to the module directory and remove the relevant folder, for example:

```bash
cd ~/MagicMirror/modules/MMM-Meteosat
rm -rf cache/m3/geocolour
```

The folder and image are recreated at the next start.

## Updating

```bash
cd ~/MagicMirror/modules/MMM-Meteosat
git pull
npm install
```

Restart MagicMirror² afterwards.

## Data source and licence

Satellite imagery is provided by EUMETSAT. This module is not affiliated with or endorsed by EUMETSAT.

The module source code is released under the MIT License. Satellite imagery remains subject to the applicable EUMETSAT data policy and attribution requirements.
