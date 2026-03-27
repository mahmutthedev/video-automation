import { useState, useEffect, useRef } from "react";
import type { Job } from "../api";
import { startGeneration, pollJob } from "../api";

interface Props {
  hooksFolder: string;
  restsFolder: string;
  hookCount: number;
  restCount: number;
  context: string;
  hookDuration: number;
  variationsPerCombo: number;
  onDone: () => void;
}

export function GenerateSection({
  hooksFolder,
  restsFolder,
  hookCount,
  restCount,
  context,
  hookDuration,
  variationsPerCombo,
  onDone,
}: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  const totalCombinations = hookCount * restCount * variationsPerCombo;
  const canGenerate =
    hookCount > 0 && restCount > 0 && hooksFolder && restsFolder;
  const isRunning = job?.status === "running";

  async function handleStart() {
    setError(null);
    setJob(null);
    try {
      const { jobId } = await startGeneration({
        hooksFolder,
        restsFolder,
        context,
        hookDuration,
        variationsPerCombo,
      });
      setJob({
        id: jobId,
        status: "running",
        total: totalCombinations,
        completed: 0,
        current: "Starting...",
        results: [],
      });

      pollingRef.current = setInterval(async () => {
        try {
          const updated = await pollJob(jobId);
          setJob(updated);
          if (updated.status !== "running") {
            clearInterval(pollingRef.current);
            onDone();
          }
        } catch {
          clearInterval(pollingRef.current);
        }
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const pct = job ? Math.round((job.completed / job.total) * 100) : 0;

  return (
    <div className="generate-section">
      <h2>Generate Variations</h2>
      <div className="generate-bar">
        <button
          className="btn-generate"
          disabled={!canGenerate || isRunning}
          onClick={handleStart}
        >
          {isRunning ? "Processing..." : "Generate All"}
        </button>
        <span className="generate-info">
          {canGenerate
            ? `${hookCount} hook(s) x ${restCount} rest(s) x ${variationsPerCombo} = ${totalCombinations} video(s)`
            : "Pick both folders with videos to get started"}
        </span>
      </div>

      {error && <div className="field-error" style={{ marginTop: "0.75rem" }}>{error}</div>}

      {job && (
        <div className="progress-container">
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-text">
            {job.status === "done"
              ? `Done! ${job.results.length} video(s) generated.`
              : job.status === "error"
                ? `Error: ${job.error}`
                : `${job.completed}/${job.total} — ${job.current}`}
          </div>

          {job.status === "done" && job.results.length > 0 && (
            <div className="results-list">
              {job.results.map((r, i) => (
                <div key={i} className="result-item">
                  <span className="result-file">{r.file}</span>
                  <span className="result-text">"{r.text}"</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
