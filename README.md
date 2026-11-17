# NutriSnap AI 🥗📸

A calorie-tracking web app built with **vibe-coding** for an AI course assignment.

**Snap a photo of your food → on-device AI recognizes the dish → you get calories & macros → and the app shows how it contributes to your goal** (lose fat / maintain / gain muscle / gain weight).

## Features
- 📸 **Photo scan**: a MobileNetV2 neural network fine-tuned on Food-101 (76% top-1 accuracy) runs **100% in the browser** via ONNX Runtime WebAssembly — no server, no API key, ~9 MB model. Top-3 guesses are shown; nutrition is looked up in the open [Open Food Facts](https://world.openfoodfacts.org) database (with a built-in per-dish estimate as fallback).
- 🔍 **Food search**: live search over 3M+ real products (Open Food Facts API), barcode lookup, a quick-add list of common foods, and custom entries.
- 🎯 **Personal plan**: BMR (Mifflin-St Jeor) × activity = TDEE → calorie target per goal (deficit / maintenance / lean bulk / surplus) + protein/carbs/fat targets.
- 📊 **Dashboard**: calorie ring, macro bars, per-food "goal impact" chips, water tracker, 7-day chart, weight trend.
- 💾 Data stays on the device (localStorage); installable PWA with offline support (service worker).

## Run it
Any static file server works, e.g.:

```bash
python -m http.server 8000
# open http://localhost:8000
```

No build step. Plain HTML/CSS/JS.

## Stack
- Vanilla HTML/CSS/JS
- [onnxruntime-web 1.17.3](https://www.npmjs.com/package/onnxruntime-web) (WASM, vendored in `vendor/`)
- Model: MobileNetV2 fine-tuned on Food-101 (`AlexKoff88/mobilenet_v2_food101` checkpoint, Apache-2.0), exported to ONNX and served locally from `assets/`
- Open Food Facts public API for nutrition data

## Project structure
```
index.html  styles.css  app.js  data.js  labels.js
manifest.webmanifest  sw.js
assets/food101_convnext_q.onnx     # on-device food classifier (33 MB, quantized)
vendor/onnxruntime-web/            # ONNX Runtime WASM (vendored)
icons/                             # PWA icons
tools/                             # dev scripts used while building (model testing etc.)
```
