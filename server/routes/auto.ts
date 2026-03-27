import { Router } from "express";
import path from "path";
import fs from "fs";
import { generateHookText, generateCaption, evaluateBestVariation } from "../lib/llm";
import { combineVideos } from "../lib/ffmpeg";
import { publishReel } from "../lib/instagram";

const router = Router();

const SETTINGS_FILE = path.join(__dirname, "..", "..", "settings.json");
const outputDir = path.join(__dirname, "..", "..", "output");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);

// ── Scheduler state ──────────────────────────────────────────────────────────

const scheduler = {
  enabled: false,
  running: false,
  timer: null as NodeJS.Timeout | null,
  nextRunAt: null as string | null,
};

const DEFAULT_INTERVAL_MINUTES = 60;

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadSettings(): Record<string, unknown> {
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveSettings(update: Record<string, unknown>) {
  const current = loadSettings();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ ...current, ...update }, null, 2));
}

function getVideoFiles(dir: string): string[] {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f));
}

// ── Core auto-post logic ─────────────────────────────────────────────────────

export interface AutoRunResult {
  hookText: string;
  caption: string;
  filename: string;
  publishedAt: string;
  mediaId: string;
  variationPicked: number;
  totalVariations: number;
  combo: { hook: string; rest: string };
}

async function runAutoPost(): Promise<AutoRunResult> {
  const settings = loadSettings();

  const hooksFolder = settings.hooksFolder as string | undefined;
  const restsFolder = settings.restsFolder as string | undefined;
  const context = (settings.context as string) || "";
  const hookDuration = (settings.hookDuration as number) || 4;
  const variationsPerCombo = (settings.variationsPerCombo as number) || 5;
  const igAccessToken = settings.igAccessToken as string | undefined;
  const igUserId = settings.igUserId as string | undefined;

  if (!hooksFolder || !restsFolder)
    throw new Error("hooksFolder and restsFolder must be configured in Settings.");
  if (!igAccessToken || !igUserId)
    throw new Error("Instagram is not connected. Connect it in the Instagram section first.");

  const hooks = getVideoFiles(hooksFolder);
  const rests = getVideoFiles(restsFolder);
  if (hooks.length === 0) throw new Error(`No videos found in hooks folder: ${hooksFolder}`);
  if (rests.length === 0) throw new Error(`No videos found in rests folder: ${restsFolder}`);

  // Build all combos
  type Combo = { hook: string; rest: string };
  const allCombos: Combo[] = [];
  for (const hook of hooks) {
    for (const rest of rests) {
      allCombos.push({ hook, rest });
    }
  }

  // Exclude last used combo (if more than one combo exists)
  const lastCombo = settings.lastCombo as Combo | undefined;
  const available =
    lastCombo && allCombos.length > 1
      ? allCombos.filter((c) => !(c.hook === lastCombo.hook && c.rest === lastCombo.rest))
      : allCombos;

  const chosen = available[Math.floor(Math.random() * available.length)];

  fs.mkdirSync(outputDir, { recursive: true });

  // Generate all variations in parallel
  type VariationResult = { videoPath: string; hookText: string; caption: string };

  const generateVariation = async (i: number): Promise<VariationResult> => {
    const hookText = await generateHookText(context);
    const caption = await generateCaption(context, hookText);

    const hookName = path.basename(chosen.hook, path.extname(chosen.hook));
    const restName = path.basename(chosen.rest, path.extname(chosen.rest));
    const outputPath = path.join(
      outputDir,
      `auto_${hookName}_${restName}_v${i + 1}_${Date.now()}.mp4`
    );

    await combineVideos(chosen.hook, chosen.rest, hookText, outputPath, hookDuration);
    fs.writeFileSync(
      outputPath.replace(/\.[^.]+$/, ".json"),
      JSON.stringify({ hookText, caption }, null, 2)
    );
    return { videoPath: outputPath, hookText, caption };
  };

  const variations = await Promise.all(
    Array.from({ length: variationsPerCombo }, (_, i) => generateVariation(i))
  );

  // Evaluate — pick the best variation
  const winnerIdx = await evaluateBestVariation(
    variations.map((v) => ({ hookText: v.hookText, caption: v.caption })),
    context
  );
  const winner = variations[winnerIdx];

  // Clean up losers
  for (let i = 0; i < variations.length; i++) {
    if (i !== winnerIdx) {
      try {
        fs.unlinkSync(variations[i].videoPath);
        const sidecar = variations[i].videoPath.replace(/\.[^.]+$/, ".json");
        if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
      } catch { /* best-effort */ }
    }
  }

  // Publish to Instagram
  const published = await publishReel(igUserId, igAccessToken, winner.videoPath, winner.caption);

  const result: AutoRunResult = {
    hookText: winner.hookText,
    caption: winner.caption,
    filename: path.basename(winner.videoPath),
    publishedAt: new Date().toISOString(),
    mediaId: published.mediaId,
    variationPicked: winnerIdx + 1,
    totalVariations: variationsPerCombo,
    combo: {
      hook: path.basename(chosen.hook),
      rest: path.basename(chosen.rest),
    },
  };

  saveSettings({
    lastCombo: chosen,
    lastRunAt: result.publishedAt,
    lastPublished: result,
    lastError: null,
  });

  return result;
}

// ── Scheduler helpers ────────────────────────────────────────────────────────

function scheduleNext() {
  if (scheduler.timer) clearTimeout(scheduler.timer);
  const settings = loadSettings();
  const intervalMs = ((settings.schedulerIntervalMinutes as number) || DEFAULT_INTERVAL_MINUTES) * 60 * 1000;
  const fireAt = Date.now() + intervalMs;
  scheduler.nextRunAt = new Date(fireAt).toISOString();

  scheduler.timer = setTimeout(async () => {
    if (!scheduler.enabled || scheduler.running) {
      scheduleNext();
      return;
    }
    scheduler.running = true;
    try {
      await runAutoPost();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      saveSettings({ lastError: msg, lastRunAt: new Date().toISOString() });
      console.error("[auto-post] Error:", msg);
    } finally {
      scheduler.running = false;
      if (scheduler.enabled) scheduleNext();
    }
  }, intervalMs);
}

export function initScheduler() {
  const settings = loadSettings();
  if (settings.schedulerEnabled) {
    scheduler.enabled = true;
    scheduleNext();
    console.log("[auto-post] Scheduler restored from settings — runs every hour.");
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/status", (_req, res) => {
  const settings = loadSettings();
  res.json({
    enabled: scheduler.enabled,
    running: scheduler.running,
    nextRunAt: scheduler.enabled ? scheduler.nextRunAt : null,
    lastRunAt: settings.lastRunAt || null,
    lastPublished: settings.lastPublished || null,
    lastError: settings.lastError || null,
    intervalMinutes: (settings.schedulerIntervalMinutes as number) || DEFAULT_INTERVAL_MINUTES,
  });
});

router.post("/set-interval", (req, res) => {
  const { minutes } = req.body as { minutes: number };
  if (!minutes || minutes < 1) { res.status(400).json({ error: "minutes must be >= 1" }); return; }
  saveSettings({ schedulerIntervalMinutes: minutes });
  // Reschedule with new interval if running
  if (scheduler.enabled) scheduleNext();
  res.json({ intervalMinutes: minutes, nextRunAt: scheduler.nextRunAt });
});

router.post("/start", (_req, res) => {
  scheduler.enabled = true;
  saveSettings({ schedulerEnabled: true });
  if (!scheduler.timer) scheduleNext();
  res.json({ enabled: true, nextRunAt: scheduler.nextRunAt });
});

router.post("/stop", (_req, res) => {
  scheduler.enabled = false;
  if (scheduler.timer) {
    clearTimeout(scheduler.timer);
    scheduler.timer = null;
  }
  scheduler.nextRunAt = null;
  saveSettings({ schedulerEnabled: false });
  res.json({ enabled: false });
});

router.post("/run-now", async (_req, res) => {
  if (scheduler.running) {
    res.status(409).json({ error: "A run is already in progress." });
    return;
  }

  scheduler.running = true;
  res.json({ started: true });

  try {
    await runAutoPost();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    saveSettings({ lastError: msg, lastRunAt: new Date().toISOString() });
    console.error("[auto-post] run-now error:", msg);
  } finally {
    scheduler.running = false;
  }
});

export { router as autoRouter };
