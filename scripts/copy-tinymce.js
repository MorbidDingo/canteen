/**
 * Copies TinyMCE static assets (skins, plugins, themes, models, icons) into
 * /public/tinymce so the editor can be self-hosted without a Tiny Cloud account
 * or API key.  Runs automatically after `npm install`.
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "tinymce");
const dest = path.join(__dirname, "..", "public", "tinymce");

const assets = [
  "tinymce.min.js",
  "tinymce.js",
  "tinymce.d.ts",
  "plugins",
  "skins",
  "themes",
  "models",
  "icons",
];

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

fs.mkdirSync(dest, { recursive: true });

for (const asset of assets) {
  const from = path.join(src, asset);
  const to = path.join(dest, asset);
  if (fs.existsSync(from)) {
    copyRecursive(from, to);
  }
}

console.log("✓ TinyMCE assets copied to public/tinymce");
