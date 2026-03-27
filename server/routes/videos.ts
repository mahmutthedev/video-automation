import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";

const router = Router();

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const outputDir = path.join(__dirname, "..", "..", "output");

// Upload directories (used when hosting remotely)
const UPLOAD_DIRS: Record<string, string> = {
  hooks: path.join(__dirname, "..", "..", "uploads", "hooks"),
  rests: path.join(__dirname, "..", "..", "uploads", "rests"),
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const bucket = (req.params as { bucket: string }).bucket;
      const dir = UPLOAD_DIRS[bucket];
      if (!dir) return cb(new Error("Invalid bucket"), "");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, file.originalname),
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, VIDEO_EXTENSIONS.has(ext));
  },
});

function readSidecar(videoPath: string): { hookText?: string; caption?: string } {
  const sidecar = videoPath.replace(/\.[^.]+$/, ".json");
  if (!fs.existsSync(sidecar)) return {};
  try { return JSON.parse(fs.readFileSync(sidecar, "utf-8")) as { hookText?: string; caption?: string }; }
  catch { return {}; }
}

function getVideoFiles(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const fullPath = path.join(dir, f);
      const meta = readSidecar(fullPath);
      return { name: f, fullPath, size: fs.statSync(fullPath).size, ...meta };
    });
}

// Scan a given folder path for video files
router.post("/scan", (req, res) => {
  const { folderPath } = req.body as { folderPath: string };
  if (!folderPath) {
    res.status(400).json({ error: "folderPath is required" });
    return;
  }

  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) {
    res.status(400).json({ error: `Folder does not exist: ${resolved}` });
    return;
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    res.status(400).json({ error: `Not a directory: ${resolved}` });
    return;
  }

  const files = getVideoFiles(resolved);
  res.json({ folder: resolved, files });
});

// List output videos
router.get("/output", (_req, res) => {
  fs.mkdirSync(outputDir, { recursive: true });
  res.json(getVideoFiles(outputDir));
});

// Delete an output video
router.delete("/output/:filename", (req, res) => {
  const filePath = path.join(outputDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    const sidecar = filePath.replace(/\.[^.]+$/, ".json");
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    res.json({ deleted: true });
  } else {
    res.status(404).json({ error: "File not found" });
  }
});


// Upload videos to a server-side bucket (hooks or rests)
router.post("/upload/:bucket", upload.array("files"), (req, res) => {
  const bucket = req.params.bucket as string;
  if (!UPLOAD_DIRS[bucket]) {
    res.status(400).json({ error: "bucket must be 'hooks' or 'rests'" });
    return;
  }
  const dir = UPLOAD_DIRS[bucket];
  res.json({ folder: dir, files: getVideoFiles(dir) });
});

// Delete an uploaded source video
router.delete("/upload/:bucket/:filename", (req, res) => {
  const { bucket, filename } = req.params as { bucket: string; filename: string };
  if (!UPLOAD_DIRS[bucket]) { res.status(400).json({ error: "Invalid bucket" }); return; }
  const filePath = path.join(UPLOAD_DIRS[bucket], filename);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ deleted: true }); }
  else res.status(404).json({ error: "File not found" });
});

// List uploaded source videos for a bucket
router.get("/upload/:bucket", (req, res) => {
  const bucket = req.params.bucket as string;
  if (!UPLOAD_DIRS[bucket]) { res.status(400).json({ error: "Invalid bucket" }); return; }
  const dir = UPLOAD_DIRS[bucket];
  fs.mkdirSync(dir, { recursive: true });
  res.json({ folder: dir, files: getVideoFiles(dir) });
});

export { router as videosRouter };
