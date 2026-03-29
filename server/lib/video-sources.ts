import fs from "fs";
import path from "path";
import { PATHS } from "./paths";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);

type Bucket = "hooks" | "rests";

function getBucketDir(bucket: Bucket): string {
  return bucket === "hooks" ? PATHS.uploads.hooks : PATHS.uploads.rests;
}

function isExistingDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function hasVideoFiles(dir: string): boolean {
  if (!isExistingDirectory(dir)) return false;
  return fs.readdirSync(dir).some((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

export function resolveVideoSourceDir(configuredPath: string | undefined, bucket: Bucket): string {
  const bucketDir = getBucketDir(bucket);
  const trimmed = configuredPath?.trim();

  if (hasVideoFiles(bucketDir)) return bucketDir;
  if (!trimmed) return bucketDir;

  const resolved = path.resolve(trimmed);
  if (isExistingDirectory(resolved)) return resolved;

  return bucketDir;
}

export function sanitizeSavedVideoSource(configuredPath: string | undefined, bucket: Bucket): string {
  const trimmed = configuredPath?.trim();
  if (!trimmed) return getBucketDir(bucket);

  const resolved = path.resolve(trimmed);
  if (isExistingDirectory(resolved)) return resolved;

  return getBucketDir(bucket);
}

