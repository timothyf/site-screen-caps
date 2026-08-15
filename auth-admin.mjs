import fs from "fs/promises";
import path from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { chromium } from "playwright";

const startUrl = process.argv[2];
const storageStatePath = path.resolve(
  process.env.PLAYWRIGHT_STORAGE_STATE || "auth/admin.json"
);

if (!startUrl) {
  console.error("Usage: npm run auth:admin -- http://localhost:5173");
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const prompt = createInterface({ input, output });
  await prompt.question(
    "Log in as Admin in the browser, then press Enter here to save the session. "
  );
  prompt.close();

  await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });

  console.log(`Saved Playwright session to ${storageStatePath}`);
} finally {
  await browser.close();
}
