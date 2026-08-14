import { normalizeUrl, shouldSkipAsset } from "./url-utils.mjs";

export async function waitForPage(page) {
  await page.waitForTimeout(750);
}

export async function waitForContent(page) {
  await page.waitForTimeout(500);
}

export async function waitForLoaders(page) {
  const loaders = page.locator([
    ".p-progress-spinner",
    ".p-skeleton",
    '[aria-busy="true"]',
  ].join(","));

  try {
    if (await loaders.count()) {
      await loaders.first().waitFor({
        state: "hidden",
        timeout: 5000,
      });
    }
  } catch {
    // Best-effort loader handling.
  }
}

export async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;

      const timer = setInterval(() => {
        const scrollHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );

        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo({ top: 0, behavior: "instant" });
          setTimeout(resolve, 300);
        }
      }, 100);
    });
  });
}

export async function getInternalLinks(page, origin) {
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("href"))
        .filter(Boolean)
    );

  const links = [];

  for (const href of hrefs) {
    const normalized = normalizeUrl(href, page.url());

    if (!normalized) {
      continue;
    }

    const url = new URL(normalized);

    if (url.origin !== origin) {
      continue;
    }

    if (shouldSkipAsset(normalized)) {
      continue;
    }

    links.push(normalized);
  }

  return [...new Set(links)];
}
