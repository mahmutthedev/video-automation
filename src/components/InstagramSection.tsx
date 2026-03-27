import { useState, useEffect, useCallback } from "react";
import type { VideoFile, IGStatus } from "../api";
import { igGetStatus, igConnect, igConnectFromEnv, igDisconnect, igPublish } from "../api";

interface Props {
  videos: VideoFile[];
}

export function InstagramSection({ videos }: Props) {
  const [status, setStatus] = useState<IGStatus>({ connected: false });
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Publish state
  const [selectedVideo, setSelectedVideo] = useState("");
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    igGetStatus().then(setStatus);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await igConnect({
        shortLivedToken: token,
      });
      setStatus({
        connected: true,
        username: result.username,
        igUserId: result.igUserId,
      });
      setToken("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectError(msg);
    } finally {
      setConnecting(false);
    }
  }

  async function handleConnectFromEnv() {
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await igConnectFromEnv();
      setStatus({ connected: true, username: result.username, igUserId: result.igUserId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectError(msg);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await igDisconnect();
    setStatus({ connected: false });
  }

  async function handlePublish() {
    if (!selectedVideo) return;
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      const result = await igPublish(selectedVideo, caption);
      setPublishResult(
        `Published! Media ID: ${result.mediaId}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPublishError(msg);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="ig-section">
      <h2>Instagram Publishing</h2>

      {!status.connected ? (
        <div className="ig-connect">
          <p className="section-desc">
            Connect your Instagram Business account. You need a Meta Developer
            App with <code>instagram_basic</code>,{" "}
            <code>instagram_content_publish</code>, and{" "}
            <code>pages_show_list</code> permissions.
          </p>

          <div className="ig-setup-steps">
            <div className="ig-step">
              <span className="ig-step-num">1</span>
              <span>
                Create a Meta App at{" "}
                <code>developers.facebook.com</code> &rarr; Add Instagram
                Product
              </span>
            </div>
            <div className="ig-step">
              <span className="ig-step-num">2</span>
              <span>
                In Graph API Explorer, select your app and request permissions:{" "}
                <code>instagram_basic</code>,{" "}
                <code>instagram_content_publish</code>,{" "}
                <code>pages_show_list</code>,{" "}
                <code>pages_read_engagement</code>
              </span>
            </div>
            <div className="ig-step">
              <span className="ig-step-num">3</span>
              <span>Generate a User Access Token and paste it below</span>
            </div>
          </div>

          <button
            className="btn-generate"
            onClick={handleConnectFromEnv}
            disabled={connecting}
            style={{ marginBottom: "1rem" }}
          >
            {connecting ? "Connecting..." : "Connect using .env"}
          </button>

          <div className="ig-divider">or paste a new token manually</div>

          <div className="ig-fields">
            <div className="ig-field full">
              <label>Short-Lived User Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste from Graph API Explorer (App ID & Secret loaded from .env)"
              />
              <span className="field-hint">App ID and App Secret are loaded from your .env file automatically.</span>
            </div>
          </div>

          <button
            className="btn-generate"
            onClick={handleConnect}
            disabled={connecting || !token}
          >
            {connecting ? "Connecting..." : "Connect Instagram"}
          </button>

          {connectError && (
            <div className="field-error" style={{ marginTop: "0.75rem" }}>
              {connectError}
            </div>
          )}
        </div>
      ) : (
        <div className="ig-connected">
          <div className="ig-account-bar">
            <div className="ig-account-info">
              <span className="ig-connected-badge">Connected</span>
              <span className="ig-username">@{status.username}</span>
            </div>
            <button className="btn-disconnect" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>

          <div className="ig-publish">
            <div className="ig-field">
              <label>Select Video</label>
              <select
                value={selectedVideo}
                onChange={(e) => setSelectedVideo(e.target.value)}
              >
                <option value="">-- Choose a video --</option>
                {videos.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="ig-field full">
              <label>Caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your Instagram caption..."
                rows={3}
              />
            </div>
            <button
              className="btn-generate"
              onClick={handlePublish}
              disabled={publishing || !selectedVideo}
            >
              {publishing ? "Publishing..." : "Publish to Instagram"}
            </button>

            {publishResult && (
              <div className="ig-success" style={{ marginTop: "0.75rem" }}>
                {publishResult}
              </div>
            )}
            {publishError && (
              <div className="field-error" style={{ marginTop: "0.75rem" }}>
                {publishError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
