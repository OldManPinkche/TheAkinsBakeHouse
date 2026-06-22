const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "outputs");
const staticFiles = ["index.html", "menu.html", "checkout.html", "CNAME"];
const staticDirs = ["assets"];

function copyFile(fileName) {
  const source = path.join(rootDir, fileName);
  const destination = path.join(outputDir, fileName);

  if (!fs.existsSync(source)) {
    return;
  }

  fs.copyFileSync(source, destination);
}

function copyDir(dirName) {
  const source = path.join(rootDir, dirName);
  const destination = path.join(outputDir, dirName);

  if (!fs.existsSync(source)) {
    return;
  }

  fs.cpSync(source, destination, {
    recursive: true
  });
}

fs.rmSync(outputDir, {
  recursive: true,
  force: true
});
fs.mkdirSync(outputDir, {
  recursive: true
});

staticFiles.forEach(copyFile);
staticDirs.forEach(copyDir);

console.log("Static site built to outputs/");
