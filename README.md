# Luminary Image Studio — All-In-One Pro Image Suite

A modern, client-side, browser-based image manipulation, conversion, compression, and enhancement studio. Runs **100% privately in your local browser** with an Apple & Google inspired frosted glassmorphism white interface.

---

## 🚀 How to Run

You can run this application immediately on your local machine using any of the following methods:

### Method 1: Double-Click (Zero Install)
1. Double-click **`start.bat`** (on Windows)  
   *OR*
2. Simply double-click **`index.html`** in any browser (Chrome, Edge, Firefox, Safari, Brave).

### Method 2: Local HTTP Server (Python)
```bash
python server.py
```
This automatically launches the server at `http://localhost:8080/index.html` and opens your browser.

---

## 🛠️ Complete Suite of Tools

| Category | Tools & Features |
| :--- | :--- |
| **Format Conversion** | Convert between **PNG, JPG, WEBP, AVIF, BMP, ICO** with real-time quality tuning and estimated file size. |
| **Compression & Target Size** | **Target File Size Optimizer**: Compresses down to exact target KB or MB (e.g. 200 KB, 500 KB, 1 MB).<br>**Megapixel Reducer**: Downscales resolution to exact Megapixels (e.g. 2.0 MP, 1.0 MP, 0.5 MP) while preserving aspect ratio. |
| **Aspect Ratio & Resizing** | Presets for **1:1** (Square), **16:9** (YouTube), **9:16** (TikTok/Reels), **4:5** (Instagram), **4:3**, **3:2**, **21:9**, and Custom Dimensions.<br>Fitting modes: **Frosted Blur Pad**, Smart Center Crop, White Pad, Stretch. |
| **Crop, Rotate & Straighten** | Interactive Draggable Crop Box with Rule-of-Thirds grid, Rotate 90° CW/CCW, Horizontal/Vertical flip, and free straighten angle (-45° to +45°). |
| **Transparency & Magic Eraser** | Overall Opacity slider (0–100%) + **Magic Wand Color Remover** (click any canvas pixel to make that color transparent with tolerance and edge feathering). |
| **Logo & Watermark Stamper** | Custom image logo upload with 9-point anchor snap (Top-Left, Center, Bottom-Right, etc.), scale, and opacity.<br>Text watermark with custom font size and diagonal repeating pattern. |
| **Blur & Privacy Censor** | **Gaussian Blur** radius slider, **Tilt-Shift** depth-of-field lens blur, and **Pixelate / Mosaic** privacy censor blocks. |
| **Pro Color & Light Adjust** | Brightness, Contrast, Saturation, Exposure, Warmth/Temperature, and Convolution Sharpening.<br>One-click presets: *Vivid*, *Noir*, *Warm Glow*, *Cool Studio*, *Sepia*. |
| **Border, Squircle & Mockups** | Corner radius with **Apple Squircle continuous curvature**, outer borders, floating drop shadow, and canvas mockup padding. |
| **Color Palette Extractor** | Automatic dominant 6-color palette extraction with hex codes, one-click copy to clipboard, and interactive eyedropper loupe. |
| **Batch & Media Renamer** | **Two Dedicated Sections (Images & Videos)** with rule-based renaming (Prefix, Suffix, Sequence padding `1`, `01`, `001`, Find & Replace, Casing).<br>**100% Lossless Video Quality**: Original video & audio bitstreams are preserved bit-for-bit with zero re-encoding.<br>**Folder vs. ZIP Export**: Download directly into a local folder (no extraction needed via File System Access API) or export as a ZIP archive. |
| **History & Auto-Save Tracking** | Step-by-step Undo/Redo stack (Ctrl+Z / Ctrl+Y), Before/After split curtain viewer, automatic 5-minute session checkpoints, and synchronization with `PROJECT_HISTORY.md`. |

---

## 🧪 Automated Testing
Run the test suite via:
```bash
node tests/test-image-tool.js
```
Verified passing **27/27 tests** across Megapixel math, aspect ratio geometry, color distances, MIME resolution, batch queue, filename de-duplication, crop handle calculations, budget compliance, history persistence, video queue filtering, lossless bit-for-bit stream preservation, renaming patterns, duration formatting, and folder direct export mocks.
