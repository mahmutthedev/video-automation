import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { videosRouter } from "./routes/videos";
import { generateRouter } from "./routes/generate";
import { settingsRouter } from "./routes/settings";
import { instagramRouter } from "./routes/instagram";
import { autoRouter, initScheduler } from "./routes/auto";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Ensure output directory exists
const outputDir = path.join(__dirname, "..", "output");
fs.mkdirSync(outputDir, { recursive: true });

// Serve output video files with range request support for proper browser playback
app.get("/api/files/output/:filename", (req, res) => {
  const filePath = path.join(outputDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.use("/api/videos", videosRouter);
app.use("/api/generate", generateRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/instagram", instagramRouter);
app.use("/api/auto", autoRouter);

// Serve built frontend in production
const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initScheduler();
});
