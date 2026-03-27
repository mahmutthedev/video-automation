import { useCallback, useEffect, useRef, useState } from "react";
import type { AutoStatus } from "../api";
import { autoGetStatus, autoRunNow, autoSetInterval, autoStart, autoStop } from "../api";

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "any moment";
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

export function AutoPostSection() {
  const [status, setStatus] = useState<AutoStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [runError, setRunError] = useState("");
  const [intervalInput, setIntervalInput] = useState<number>(60);
  const [savingInterval, setSavingInterval] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    autoGetStatus().then(setStatus).catch(() => null);
  }, []);

  useEffect(() => {
    autoGetStatus().then((s) => { setStatus(s); setIntervalInput(s.intervalMinutes); });
    pollRef.current = setInterval(refresh, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const handleToggle = async () => {
    if (!status) return;
    setToggling(true);
    try {
      if (status.enabled) {
        await autoStop();
      } else {
        await autoStart();
      }
      await refresh();
    } finally {
      setToggling(false);
    }
  };

  const handleSaveInterval = async () => {
    setSavingInterval(true);
    try {
      await autoSetInterval(intervalInput);
      await refresh();
    } finally {
      setSavingInterval(false);
    }
  };

  const handleRunNow = async () => {
    setRunError("");
    setTriggering(true);
    try {
      await autoRunNow();
      // Poll until the run completes
      const waitForDone = setInterval(async () => {
        const s = await autoGetStatus();
        setStatus(s);
        if (!s.running) {
          clearInterval(waitForDone);
          setTriggering(false);
        }
      }, 3000);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setTriggering(false);
    }
  };

  const p = status?.lastPublished;

  return (
    <section className="section auto-post-section">
      <div className="section-header">
        <div>
          <h2>Auto Publish</h2>
          <p className="section-description">
            Every hour, pick a random combo, generate 5 variations, evaluate with AI, publish the winner.
          </p>
        </div>
        <div className="auto-controls">
          <button
            className={`btn-toggle ${status?.enabled ? "active" : ""}`}
            onClick={handleToggle}
            disabled={toggling || !status}
          >
            {toggling ? "..." : status?.enabled ? "Running — Disable" : "Enable Hourly"}
          </button>
          <button
            className="btn-run-now"
            onClick={handleRunNow}
            disabled={triggering || status?.running}
          >
            {triggering || status?.running ? (
              <span className="spinner-text">Running...</span>
            ) : (
              "Run Now"
            )}
          </button>
        </div>
      </div>

      <div className="auto-interval-row">
        <label>Run every</label>
        <input
          type="number"
          min={1}
          value={intervalInput}
          onChange={(e) => setIntervalInput(Number(e.target.value))}
          className="interval-input"
        />
        <span>minutes</span>
        <button
          className="btn-save-interval"
          onClick={handleSaveInterval}
          disabled={savingInterval || !status}
        >
          {savingInterval ? "Saving..." : "Save"}
        </button>
      </div>

      {status?.enabled && status.nextRunAt && (
        <div className="auto-next-run">
          Next run in <strong>{timeUntil(status.nextRunAt)}</strong>
        </div>
      )}

      {status?.running && (
        <div className="auto-running-banner">
          Generating variations and publishing — this takes a few minutes...
        </div>
      )}

      {runError && (
        <div className="auto-error">Error: {runError}</div>
      )}

      {status?.lastError && !status.running && (
        <div className="auto-error">
          Last run failed: {status.lastError}
        </div>
      )}

      {p && (
        <div className="auto-last-published">
          <div className="last-pub-header">
            <span className="last-pub-label">Last published</span>
            <span className="last-pub-time">{timeAgo(p.publishedAt)}</span>
          </div>
          <div className="last-pub-combo">
            {p.combo.hook} × {p.combo.rest}
          </div>
          <div className="last-pub-meta">
            Variation {p.variationPicked}/{p.totalVariations} chosen by AI
          </div>
          <div className="last-pub-hook">"{p.hookText}"</div>
          <div className="last-pub-caption">{p.caption}</div>
          <div className="last-pub-mediaid">
            Media ID: <code>{p.mediaId}</code>
          </div>
        </div>
      )}
    </section>
  );
}
