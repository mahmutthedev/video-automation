import { Router } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { generateHookText, generateCaption } from "../lib/llm";
import { combineVideos } from "../lib/ffmpeg";

const router = Router();

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const outputDir = path.join(__dirname, "..", "..", "output");

interface Job {
  id: string;
  status: "running" | "done" | "error";
  total: number;
  completed: number;
  current: string;
  results: { file: string; text: string; caption: string }[];
  error?: string;
}

const jobs = new Map<string, Job>();

function getVideoFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f));
}

interface StartBody {
  hooksFolder: string;
  restsFolder: string;
  context: string;
  hookDuration: number;
  variationsPerCombo: number;
}

// Start generation
router.post("/start", (req, res) => {
  const { hooksFolder, restsFolder, context, hookDuration, variationsPerCombo } =
    req.body as StartBody;

  if (!hooksFolder || !restsFolder) {
    res
      .status(400)
      .json({ error: "Both hooksFolder and restsFolder are required." });
    return;
  }

  const hooks = getVideoFiles(path.resolve(hooksFolder));
  const rests = getVideoFiles(path.resolve(restsFolder));

  if (hooks.length === 0) {
    res
      .status(400)
      .json({ error: `No video files found in hooks folder: ${hooksFolder}` });
    return;
  }
  if (rests.length === 0) {
    res.status(400).json({
      error: `No video files found in rests folder: ${restsFolder}`,
    });
    return;
  }

  const duration = hookDuration && hookDuration > 0 ? hookDuration : 4;
  const variations = variationsPerCombo && variationsPerCombo > 0 ? variationsPerCombo : 1;
  const total = hooks.length * rests.length * variations;

  const jobId = Date.now().toString(36);
  const job: Job = {
    id: jobId,
    status: "running",
    total,
    completed: 0,
    current: "Starting...",
    results: [],
  };
  jobs.set(jobId, job);

  processVideos(job, hooks, rests, context || "", duration, variations).catch(
    (err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    }
  );

  res.json({ jobId, total });
});

// Poll job status
router.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

interface Task {
  hook: string;
  rest: string;
  hookName: string;
  restName: string;
  variationIndex: number;
}

async function processVideos(
  job: Job,
  hooks: string[],
  rests: string[],
  context: string,
  hookDuration: number,
  variations: number
) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Build task list
  const tasks: Task[] = [];
  for (const hook of hooks) {
    for (const rest of rests) {
      for (let v = 0; v < variations; v++) {
        tasks.push({
          hook,
          rest,
          hookName: path.basename(hook, path.extname(hook)),
          restName: path.basename(rest, path.extname(rest)),
          variationIndex: v + 1,
        });
      }
    }
  }

  // Run in parallel batches — use CPU count but cap at 4 to avoid memory issues
  const concurrency = Math.min(4, os.cpus().length);
  job.current = `Processing ${tasks.length} videos (${concurrency} in parallel)...`;

  const processTask = async (task: Task) => {
    const { hook, rest, hookName, restName, variationIndex } = task;
    const timestamp = Date.now();
    const outputFile = path.join(
      outputDir,
      `${hookName}_${restName}_v${variationIndex}_${timestamp}.mp4`
    );

    let overlayText: string;
    let caption = "";
    try {
      overlayText = await generateHookText(context);
      caption = await generateCaption(context, overlayText);
    } catch {
      overlayText = "You NEED to see this";
    }

    try {
      await combineVideos(hook, rest, overlayText, outputFile, hookDuration);
      fs.writeFileSync(
        outputFile.replace(/\.[^.]+$/, ".json"),
        JSON.stringify({ hookText: overlayText, caption }, null, 2)
      );
      job.results.push({ file: path.basename(outputFile), text: overlayText, caption });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      job.results.push({ file: `FAILED: ${hookName}_${restName}_v${variationIndex}`, text: msg, caption: "" });
    }

    job.completed++;
    job.current = `${job.completed}/${job.total} done (${concurrency} in parallel)`;
  };

  // Process in batches of `concurrency`
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(batch.map(processTask));
  }

  job.status = "done";
  job.current = "All done!";
}

export { router as generateRouter };
