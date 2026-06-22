const fs = require("node:fs");
const path = require("node:path");

const envPath = path.resolve(__dirname, "..", ".env");

function loadLocalEnv() {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);

    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function isPlaceholder(value) {
  return !value || /paste_.*_here/i.test(value);
}

async function main() {
  loadLocalEnv();

  const webhookUrl = process.env.DISCORD_ORDER_WEBHOOK_URL || "";

  if (isPlaceholder(webhookUrl)) {
    console.error("Add your Discord webhook URL to DISCORD_ORDER_WEBHOOK_URL in .env first.");
    process.exit(1);
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "The Akins Bake House Orders",
      content: [
        "Test order notification",
        "If you can see this in Discord, paid website orders can post here.",
        `Sent: ${new Date().toLocaleString()}`
      ].join("\n")
    })
  });
  const body = await response.text().catch(() => "");

  if (!response.ok) {
    console.error(`Discord test failed with status ${response.status}.`);
    if (body) {
      console.error(body);
    }
    process.exit(1);
  }

  console.log("Discord test notification sent.");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
