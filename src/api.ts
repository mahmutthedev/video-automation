export interface VideoFile {
  name: string;
  fullPath: string;
  size: number;
  hookText?: string;
  caption?: string;
}

export interface ScanResult {
  folder: string;
  files: VideoFile[];
}

export interface Job {
  id: string;
  status: "running" | "done" | "error";
  total: number;
  completed: number;
  current: string;
  results: { file: string; text: string }[];
  error?: string;
}

export async function scanFolder(folderPath: string): Promise<ScanResult> {
  const res = await fetch("/api/videos/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function fetchOutputVideos(): Promise<VideoFile[]> {
  const res = await fetch("/api/videos/output");
  return res.json();
}

export async function deleteOutputVideo(filename: string): Promise<void> {
  await fetch(`/api/videos/output/${filename}`, { method: "DELETE" });
}

export async function startGeneration(params: {
  hooksFolder: string;
  restsFolder: string;
  context: string;
  hookDuration: number;
  variationsPerCombo: number;
}): Promise<{ jobId: string; total: number }> {
  const res = await fetch("/api/generate/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function pollJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/generate/status/${jobId}`);
  return res.json();
}

export interface Settings {
  hooksFolder: string;
  restsFolder: string;
  context: string;
  hookDuration: number;
  variationsPerCombo: number;
}

export async function loadSettings(): Promise<Settings> {
  const res = await fetch("/api/settings");
  return res.json();
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return res.json();
}

// ── Instagram ──

export interface IGStatus {
  connected: boolean;
  username?: string;
  igUserId?: string;
}

export async function igGetStatus(): Promise<IGStatus> {
  const res = await fetch("/api/instagram/status");
  return res.json();
}

export async function igConnect(params: {
  shortLivedToken: string;
  appId?: string;
  appSecret?: string;
}): Promise<{ success: boolean; username: string; igUserId: string }> {
  const res = await fetch("/api/instagram/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function igConnectFromEnv(): Promise<{ success: boolean; username: string; igUserId: string }> {
  const res = await fetch("/api/instagram/connect-env", { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function igDisconnect(): Promise<void> {
  await fetch("/api/instagram/disconnect", { method: "POST" });
}

export async function igPublish(
  filename: string,
  caption: string
): Promise<{ success: boolean; containerId: string; mediaId: string }> {
  const res = await fetch("/api/instagram/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, caption }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

// ── Auto-post ──

export interface AutoPublished {
  hookText: string;
  caption: string;
  filename: string;
  publishedAt: string;
  mediaId: string;
  variationPicked: number;
  totalVariations: number;
  combo: { hook: string; rest: string };
}

export interface AutoStatus {
  enabled: boolean;
  running: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastPublished: AutoPublished | null;
  lastError: string | null;
  intervalMinutes: number;
}

export async function autoGetStatus(): Promise<AutoStatus> {
  const res = await fetch("/api/auto/status");
  return res.json();
}

export async function autoStart(): Promise<{ enabled: boolean; nextRunAt: string }> {
  const res = await fetch("/api/auto/start", { method: "POST" });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
  return res.json();
}

export async function autoStop(): Promise<void> {
  await fetch("/api/auto/stop", { method: "POST" });
}

export async function autoRunNow(): Promise<void> {
  const res = await fetch("/api/auto/run-now", { method: "POST" });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
}

export async function autoSetInterval(minutes: number): Promise<void> {
  const res = await fetch("/api/auto/set-interval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minutes }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
}

export async function uploadVideos(
  bucket: "hooks" | "rests",
  files: FileList
): Promise<{ folder: string; files: VideoFile[] }> {
  const form = new FormData();
  for (const f of Array.from(files)) form.append("files", f);
  const res = await fetch(`/api/videos/upload/${bucket}`, { method: "POST", body: form });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
  return res.json();
}

export async function listUploadedVideos(
  bucket: "hooks" | "rests"
): Promise<{ folder: string; files: VideoFile[] }> {
  const res = await fetch(`/api/videos/upload/${bucket}`);
  return res.json();
}

export async function deleteUploadedVideo(
  bucket: "hooks" | "rests",
  filename: string
): Promise<void> {
  await fetch(`/api/videos/upload/${bucket}/${filename}`, { method: "DELETE" });
}
