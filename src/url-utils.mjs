import path from "path";
import {
  COMPARE_DIR,
  COMPARE_ROUTE,
  GAME_DIR,
  GAME_ROUTE,
  PLAYER_DIR,
  PLAYER_ROUTE,
  TEAM_DIR,
  TEAM_ROUTE,
} from "./config.mjs";

export function normalizeUrl(rawUrl, baseUrl) {
  try {
    const url = new URL(rawUrl, baseUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    url.hash = "";

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.href;
  } catch {
    return null;
  }
}

export function classifyUrl(urlString) {
  const url = new URL(urlString);

  let match = url.pathname.match(GAME_ROUTE);
  if (match) {
    return { type: "game", id: match[1] };
  }

  match = url.pathname.match(PLAYER_ROUTE);
  if (match) {
    return { type: "player", id: match[1] };
  }

  match = url.pathname.match(TEAM_ROUTE);
  if (match) {
    return { type: "team", id: match[1] };
  }

  if (COMPARE_ROUTE.test(url.pathname)) {
    return { type: "compare", id: null };
  }

  return { type: "general", id: null };
}

export function shouldSkipAsset(urlString) {
  const pathname = new URL(urlString).pathname.toLowerCase();

  const ignoredExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".avif",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".mp4",
    ".mov",
    ".avi",
    ".mp3",
    ".wav",
    ".css",
    ".js",
    ".mjs",
    ".json",
    ".xml",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
  ];

  return ignoredExtensions.some((extension) => pathname.endsWith(extension));
}

export function pageDirectory(urlString) {
  const page = classifyUrl(urlString);

  switch (page.type) {
    case "game":
      return GAME_DIR;
    case "player":
      return PLAYER_DIR;
    case "team":
      return TEAM_DIR;
    case "compare":
      return COMPARE_DIR;
    default:
      return "";
  }
}

export function screenshotFilename(urlString) {
  const url = new URL(urlString);
  const page = classifyUrl(urlString);

  if (page.type === "game") {
    return `game-${page.id}.png`;
  }

  if (page.type === "player") {
    return `player-${page.id}.png`;
  }

  if (page.type === "team") {
    return `team-${page.id}.png`;
  }

  let name = url.pathname;

  if (name === "/" || name === "") {
    name = "home";
  } else {
    name = name.replace(/^\/+/, "").replace(/\/+/g, "__");
  }

  if (url.search) {
    name += "__" + url.search.substring(1).replace(/[^a-zA-Z0-9-_]+/g, "_");
  }

  name = name.replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/^_+|_+$/g, "");

  return `${name || "home"}.png`;
}

export function screenshotRelativePath(urlString) {
  const directory = pageDirectory(urlString);
  const filename = screenshotFilename(urlString);

  if (!directory) {
    return filename;
  }

  return path.join(directory, filename);
}
