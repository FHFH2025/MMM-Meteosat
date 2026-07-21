# MMM-Meteosat

Near-real-time Meteosat Third Generation (MTG) satellite imagery for MagicMirror², obtained directly from the official EUMETSAT EUMETView service.

No EUMETSAT account, API key or other credentials are required.

## Features

- Current MTG full-disk imagery from EUMETSAT
- Eight selectable satellite products
- Recommended automatic day-and-night view
- Transparent background for dark MagicMirror layouts
- Separate cache for every module instance and product
- Local fallback when an update temporarily fails
- Configurable display size and source-image resolution
- Optional source, product and timestamp caption

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
    product: "auto"
  }
}
```

`auto` is recommended for most users. It displays GeoColour: a natural-looking daytime image that automatically includes infrared information at night, so clouds remain visible around the clock.

## Products

| Value | What it shows | Best suited for |
|---|---|---|
| `auto` | The recommended GeoColour view. Natural colours by day and an infrared-enhanced view at night. | General everyday use. |
| `geocolour` | The same GeoColour product selected explicitly. | Users who prefer the exact product name in their configuration. |
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
    product: "auto",
    cacheId: "",
    imageSize: 550,
    wmsImageSize: 1800,
    updateInterval: 10 * 60 * 1000,
    showTimestamp: true,
    showSource: true,
    showProduct: true,
    showStatus: true,
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
| `product` | string | `"auto"` | Satellite product listed above. |
| `cacheId` | string | `""` | Optional custom cache-folder name. Normally leave empty. |
| `imageSize` | number | `550` | Display width in pixels. |
| `wmsImageSize` | number | `1800` | Downloaded source-image width and height. Accepted range: 600–3600 pixels. |
| `updateInterval` | number | `600000` | Update interval in milliseconds. Values below five minutes are raised to five minutes. |
| `showTimestamp` | boolean | `true` | Shows the image time in the caption. |
| `showSource` | boolean | `true` | Shows EUMETSAT in the caption. |
| `showProduct` | boolean | `true` | Shows the selected product name in the caption. |
| `showStatus` | boolean | `true` | Shows status messages while no image is available. |
| `messages.loading` | string | `"Loading Meteosat image …"` | Message shown while the first image is being requested. |
| `messages.noImage` | string | `"No Meteosat image is available yet."` | Message shown when no cached or newly downloaded image is available yet. |
| `messages.error` | string | `"Meteosat image could not be loaded."` | Message shown after an image download or processing error. Technical details remain in the MagicMirror log. |

The three message texts can be changed independently. `showStatus: false` hides all of them. Technical error details are never displayed on the mirror and are written only to the MagicMirror log.

## Multiple module instances and cache folders

Every module instance always receives a separate cache folder, including the first instance. MagicMirror identifiers such as `module_3_MMM-Meteosat` are shortened automatically:

```text
cache/m3/geocolour/
cache/m4/infrared/
```

This prevents collisions when another instance is added later.

A stable custom name can be selected when required:

```js
config: {
  product: "auto",
  cacheId: "living-room"
}
```

This produces:

```text
cache/living-room/geocolour/
```

Each product folder contains:

```text
source.png
latest.png
status.json
```

## Image processing

The module combines EUMETView's existing transparency with a simple geometric full-disk mask. It does not inspect image colours and does not use brightness thresholds, HSV detection, flood fill or background guessing. This keeps the processing predictable across all supported products.

## Troubleshooting

### No image appears

- Confirm that the MagicMirror host has Internet access.
- Check that `product` contains one of the documented values.
- Inspect the MagicMirror log for an HTTP or image-processing error.
- Keep the default `wmsImageSize` while testing.

### A specialised product looks incomplete

This is often expected. Read [Why some products do not show a complete globe](#why-some-products-do-not-show-a-complete-globe). Compare the result with `auto` before assuming that the image was cropped by the module.

### Clear one cached product

Stop MagicMirror² and remove the relevant folder, for example:

```bash
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
