import { crawl } from "./src/crawler.mjs";

const startUrl = process.argv[2];

if (!startUrl) {
  console.error("Usage: node capture-site.mjs http://localhost:5173");
  process.exit(1);
}

crawl(startUrl).catch((error) => {
  console.error("\nCapture failed:");
  console.error(error);
  process.exit(1);
});
