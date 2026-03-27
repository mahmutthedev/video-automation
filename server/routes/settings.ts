import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();

const SETTINGS_FILE = path.join(__dirname, "..", "..", "settings.json");

interface Settings {
  hooksFolder: string;
  restsFolder: string;
  context: string;
  hookDuration: number;
}

const DEFAULTS: Settings = {
  hooksFolder: "",
  restsFolder: "",
  context: "",
  hookDuration: 4,
};

function load(): Settings {
  if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: Settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

router.get("/", (_req, res) => {
  res.json(load());
});

router.put("/", (req, res) => {
  const current = load();
  const updated = { ...current, ...req.body };
  save(updated);
  res.json(updated);
});

export { router as settingsRouter };
