import { useRef, useState, useCallback, useEffect } from "react";
import type { VideoFile } from "../api";
import { deleteUploadedVideo, listUploadedVideos, scanFolder, uploadVideos } from "../api";

interface Props {
  label: string;
  description: string;
  value: string;
  files: VideoFile[];
  bucket: "hooks" | "rests";
  onChange: (folder: string, files: VideoFile[]) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FolderPicker({
  label,
  description,
  value,
  files,
  bucket,
  onChange,
}: Props) {
  const [input, setInput] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync input when parent value changes (e.g. from loaded settings)
  useEffect(() => {
    if (value && value !== input) setInput(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount, load any already-uploaded files for this bucket
  useEffect(() => {
    listUploadedVideos(bucket).then((r) => {
      if (r.files.length > 0) onChange(r.folder, r.files);
    }).catch(() => null);
  }, [bucket]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = useCallback(async () => {
    if (!input.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const result = await scanFolder(input.trim());
      onChange(result.folder, result.files);
      if (result.files.length === 0) {
        setError("No video files found in this folder");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onChange("", []);
    } finally {
      setScanning(false);
    }
  }, [input, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScan();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadVideos(bucket, e.target.files);
      onChange(result.folder, result.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (filename: string) => {
    await deleteUploadedVideo(bucket, filename);
    const result = await listUploadedVideos(bucket);
    onChange(result.folder, result.files);
  };

  return (
    <div className="section">
      <h2>{label}</h2>
      <p className="section-desc">{description}</p>
      <div className="folder-input-row">
        <input
          type="text"
          className="folder-input"
          placeholder="C:\path\to\folder"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-scan" onClick={handleScan} disabled={scanning || !input.trim()}>
          {scanning ? "Scanning..." : "Scan"}
        </button>
      </div>

      <div className="upload-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
          multiple
          style={{ display: "none" }}
          onChange={handleUpload}
        />
        <button
          className="btn-upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Upload Videos"}
        </button>
        <span className="upload-hint">or use a local folder path above</span>
      </div>

      {error && <div className="field-error">{error}</div>}

      {files.length > 0 && (
        <div className="video-list">
          <div className="video-list-header">
            {files.length} video{files.length !== 1 ? "s" : ""} found
          </div>
          {files.map((v) => (
            <div key={v.name} className="video-item">
              <span className="name">{v.name}</span>
              <span className="size">{formatSize(v.size)}</span>
              <button className="btn-delete-src" onClick={() => handleDelete(v.name)} title="Remove">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
