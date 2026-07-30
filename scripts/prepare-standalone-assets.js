const fs = require("fs");
const path = require("path");

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;

  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }

    fs.copyFileSync(sourcePath, destinationPath);
  }
}

if (!fs.existsSync(standaloneDir)) {
  console.log("Standalone output not found; skipping standalone asset copy.");
  process.exit(0);
}

copyDirectory(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyDirectory(path.join(root, "public"), path.join(standaloneDir, "public"));

console.log("Copied Next static assets into standalone output.");
