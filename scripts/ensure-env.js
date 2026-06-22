const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");

const expectedEntries = [
  {
    key: "SQUARE_ACCESS_TOKEN",
    value: "paste_square_access_token_here"
  },
  {
    key: "SQUARE_LOCATION_ID",
    value: "auto"
  },
  {
    key: "SQUARE_ENVIRONMENT",
    value: "production"
  },
  {
    key: "SITE_URL",
    value: "https://theakinsbakehouse.com"
  }
];

const existingContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const existingKeys = new Set();

for (const line of existingContent.split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=/);

  if (match) {
    existingKeys.add(match[1]);
  }
}

const missingEntries = expectedEntries.filter((entry) => !existingKeys.has(entry.key));

if (!missingEntries.length) {
  console.log(".env already has every expected key.");
  process.exit(0);
}

const section = [
  "# Square checkout setup",
  ...missingEntries.map((entry) => `${entry.key}=${entry.value}`)
].join("\n");
const separator = existingContent.trim() ? "\n\n" : "";

fs.appendFileSync(envPath, `${separator}${section}\n`);

console.log(`Added missing .env placeholders: ${missingEntries.map((entry) => entry.key).join(", ")}`);
console.log("Paste the real values into .env locally and into Netlify environment variables before going live.");
