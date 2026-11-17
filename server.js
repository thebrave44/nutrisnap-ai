// Static file server for NutriSnap AI (dev + tunnel origin). No dependencies.
// SECURITY: strict allowlist — only the web app files are served.
// Dotfiles (.git, .gitignore, ...), logs, tools/, and anything else are refused.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const ALLOWED_FILES = new Set([
  "index.html", "styles.css", "app.js", "data.js", "labels.js",
  "manifest.webmanifest", "sw.js", "README.md",
]);
const ALLOWED_DIR_PREFIXES = ["assets/", "icons/", "vendor/onnxruntime-web/"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".onnx": "application/octet-stream",
  ".wasm": "application/wasm",
  ".md": "text/markdown; charset=utf-8",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const rel = path.normalize(urlPath).replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const segs = rel.split("/");
  const ext = path.extname(rel).toLowerCase();
  const allowed =
    (ALLOWED_FILES.has(rel) || ALLOWED_DIR_PREFIXES.some(p => rel.startsWith(p))) &&
    MIME[ext] &&
    !segs.some(s => s.startsWith(".")) &&
    !rel.includes("..");
  if (!allowed) { res.writeHead(404); res.end("not found"); return; }
  const file = path.join(ROOT, ...segs);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[ext],
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => console.log(`NutriSnap AI on http://127.0.0.1:${PORT} (allowlist only)`));
