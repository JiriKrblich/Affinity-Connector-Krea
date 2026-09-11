# Krea Connector for Affinity
Generate a new image from a prompt, or transform artwork already in an Affinity document, with [Krea's image API](https://www.krea.ai/docs/api-reference/introduction). The finished image is returned to Bridge for Affinity and, when there is one result and a document is open, placed back into the document automatically.


![screenshot of Krea Connector](/docs/screenshot.png)


## What you need

- **Connector for Affinity** installed and connected to Affinity.
- A Krea account with API access and available credits.
- A Krea API token. In Krea, open **Settings → API tokens** and create one.

Your token is stored in Bridge for Affinity's private credential store, outside this connector's folder. It is never committed to this repository.

## Install from the Marketplace

1. Open **Connector for Affinity**.
2. Choose **Browse** in the sidebar.
3. Search for **Krea**.
4. Select it and press **Install**.
5. Open **Krea** from the Connectors list. On its first run, paste the Krea API token when Bridge asks for it.

The Marketplace installs the connector and keeps its settings and API token when a newer connector version is installed later. There is no need to download this folder or copy files by hand.

## Use it in Affinity

1. Open the **Krea** connector.
2. Choose a model and write a prompt.
3. For image-to-image, choose a source under **Start from** — for example the current selection, layer, artboard, document, or an image file. Leave it on **Nothing** for text-to-image.
4. Choose an aspect ratio. The available aspect ratios and resolutions adjust to the selected model.
5. Press **Generate**.

Krea jobs run in the background. When the result arrives, Bridge downloads it and places a single image into the open Affinity document by default. If Krea returns several images, Bridge leaves them in the result view so you can choose which one to place rather than stacking every variant into the document.

## Controls

| Control | What it changes |
| --- | --- |
| **Model** | Chooses a Krea model or another model available through your Krea account. Press refresh beside the field to ask Krea for the models your account can use. |
| **Prompt** | The image direction sent to Krea. |
| **Start from** | Optional source artwork for image-to-image generation. |
| **How far from the original** | Krea 2 image-to-image only. A lower value keeps closer to the supplied artwork. |
| **Aspect ratio** | The output frame. Its options follow the model. |
| **Resolution** | Output size. Krea 2 supports 1K; other supported models can expose higher sizes. |
| **Place the result in the document** | Turn this off when you want the downloaded result without automatically adding it to the canvas. |

## Notes

- Large source artwork is uploaded to Krea as an asset; smaller artwork is sent directly with the generation request.
- Choosing a source image sends that image to Krea. Do not use artwork you are not permitted to share with the service.
- The connector uses Krea's current API endpoint and reports Krea's response when a request is rejected. Check the [Krea API documentation](https://www.krea.ai/docs/api-reference/introduction) if a model, credit, or account capability is unavailable.

## Development

This connector consists of [`app.json`](app.json), which describes the Bridge form, and [`index.js`](index.js), which calls Krea, waits for the job, downloads the result, and returns it to Affinity. Install it from the Marketplace for normal use; the files here are for review and development.
