import path from "path";

export const SELECTED_TEAM_NAME = "Detroit Tigers";
export const SELECTED_PLAYER_NAMES = [
  "Riley Greene",
  "Jacob Misiorowski",
];

export const OUTPUT_DIR = path.resolve("docs/screenshots");

export const GAME_DIR = "games";
export const PLAYER_DIR = "players";
export const TEAM_DIR = "teams";
export const COMPARE_DIR = "compare";

export const MAX_PAGES = 1000;
export const MAX_GAME_LOOKBACK_DAYS = 30;

export const VIEWPORT = {
  width: 1440,
  height: 1000,
};

export const TIME_ZONE = "America/Detroit";

export const SCHEDULE_ROUTE = "/schedule";
export const TEAMS_ROUTE = "/teams";
export const COMPARE_PAGE_ROUTE = "/compare";
export const MAIN_ROUTES = [
  "/",
  SCHEDULE_ROUTE,
  "/standings",
  "/explore",
  TEAMS_ROUTE,
];

export const GAME_ROUTE = /^\/games\/(\d+)\/?$/;
export const PLAYER_ROUTE = /^\/players\/(\d+)\/?$/;
export const TEAM_ROUTE = /^\/teams\/(\d+)\/?$/;
export const COMPARE_ROUTE = /^\/compare(?:\/.*)?$/;

export const GAME_TABS = [
  { label: "Overview", filename: "overview" },
  { label: "Box Score", filename: "box-score" },
  { label: "Pitching Analysis", filename: "pitching-analysis" },
  { label: "Batted Ball", filename: "batted-ball" },
  { label: "Situational", filename: "situational" },
  { label: "Play-by-Play", filename: "play-by-play" },
];

export const TEAM_TABS = [
  { label: "Overview", filename: "overview" },
  { label: "Roster", filename: "roster" },
  { label: "Opponent Preparation", filename: "opponent-preparation" },
  { label: "Lineup Planner", filename: "lineup-planner" },
];

export const PLAYER_PAGE_TABS = [
  { label: "Overview", filename: "overview" },
  { label: "Performance Trends", filename: "performance-trends" },
  { label: "Batted Ball Profile", filename: "batted-ball-profile" },
];

export const PLAYER_PROFILE_TABS = [
  { label: "Basic Stats", filename: "basic-stats" },
  { label: "Advanced Stats", filename: "advanced-stats" },
  { label: "Splits", filename: "splits" },
];

export const COMPARISONS = [];
