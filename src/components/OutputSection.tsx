import type { VideoFile } from "../api";
import { deleteOutputVideo } from "../api";

interface Props {
  videos: VideoFile[];
  onRefresh: () => void;
}

export function OutputSection({ videos, onRefresh }: Props) {
  async function handleDelete(name: string) {
    await deleteOutputVideo(name);
    onRefresh();
  }

  return (
    <div className="output-section">
      <h2>Output Videos ({videos.length})</h2>
      {videos.length === 0 && (
        <div className="empty">
          No generated videos yet. Configure above and hit Generate.
        </div>
      )}
      <div className="output-grid">
        {videos.map((v) => (
          <div key={v.name} className="output-card">
            <video
              src={`/api/files/output/${v.name}`}
              controls
              preload="metadata"
            />
            <div className="output-card-info">
              <span className="name" title={v.name}>{v.name}</span>
              <button className="btn-delete" onClick={() => handleDelete(v.name)} title="Delete">x</button>
            </div>
            {v.hookText && (
              <div className="output-card-hook">"{v.hookText}"</div>
            )}
            {v.caption && (
              <div className="output-card-caption">{v.caption}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
