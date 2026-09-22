const fs = require("node:fs");
const path = require("node:path");
const rules = require("../assets/order-rules.js");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "outputs");
const staticFiles = ["index.html", "menu.html", "checkout.html", "CNAME", "robots.txt", "sitemap.xml"];
const staticDirs = ["assets"];

function copyFile(fileName) {
  const source = path.join(rootDir, fileName);
  const destination = path.join(outputDir, fileName);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing static file: ${fileName}`);
  }

  if (fileName.endsWith(".html")) {
    const html = fs.readFileSync(source, "utf8").replace(/<([a-z]+)([^>]*\bdata-price-name="([^"]+)"[^>]*)>[^<]*<\/\1>/g, (match, tag, attrs, name) => {
      if (!rules.hasItem(name)) return match;
      const item = rules.priceBook[name];
      const amount = `$${item.price.toFixed(item.price % 1 === 0 ? 0 : 2)}`;
      return `<${tag}${attrs}>${item.starting ? `Starting at ${amount}` : `${amount} ${item.label}`}</${tag}>`;
    });
    fs.writeFileSync(destination, html);
  } else {
    fs.copyFileSync(source, destination);
  }
}

function copyDir(dirName) {
  const source = path.join(rootDir, dirName);
  const destination = path.join(outputDir, dirName);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing static directory: ${dirName}`);
  }

  fs.cpSync(source, destination, {
    recursive: true
  });
}

if (path.dirname(outputDir) !== rootDir || path.basename(outputDir) !== "outputs") {
  throw new Error("Build output must be the project's outputs directory.");
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
