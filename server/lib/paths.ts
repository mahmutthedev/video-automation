import path from "path";
import fs from "fs";

// In production (Railway), set DATA_DIR=/app/data (the mounted volume).
// Locally it falls back to the project root.
const BASE = process.env.DATA_DIR || path.join(__dirname, "..", "..");

export const PATHS = {
  settings: path.join(BASE, "settings.json"),
  output:   path.join(BASE, "output"),
  uploads: {
    hooks: path.join(BASE, "uploads", "hooks"),
    rests: path.join(BASE, "uploads", "rests"),
  },
};

// Ensure all directories exist on startup
export function ensureDirs() {
  for (const d of [PATHS.output, PATHS.uploads.hooks, PATHS.uploads.rests]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
