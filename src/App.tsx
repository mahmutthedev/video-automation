import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoFile } from "./api";
import { fetchOutputVideos, loadSettings, saveSettings, scanFolder } from "./api";
import { FolderPicker } from "./components/FolderPicker";
import { GenerateSection } from "./components/GenerateSection";
import { OutputSection } from "./components/OutputSection";
import { InstagramSection } from "./components/InstagramSection";
import { AutoPostSection } from "./components/AutoPostSection";

export function App() {
  const [hooksFolder, setHooksFolder] = useState("");
  const [hookFiles, setHookFiles] = useState<VideoFile[]>([]);
  const [restsFolder, setRestsFolder] = useState("");
  const [restFiles, setRestFiles] = useState<VideoFile[]>([]);
  const [context, setContext] = useState("");
  const [hookDuration, setHookDuration] = useState(4);
  const [variationsPerCombo, setVariationsPerCombo] = useState(1);
  const [outputs, setOutputs] = useState<VideoFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadOutputs = useCallback(() => {
    fetchOutputVideos().then(setOutputs);
  }, []);

  // Load saved settings on mount and re-scan folders if they were saved
  useEffect(() => {
    loadSettings().then(async (s) => {
      setContext(s.context);
      setHookDuration(s.hookDuration);
      if (s.variationsPerCombo) setVariationsPerCombo(s.variationsPerCombo);

      if (s.hooksFolder) {
        setHooksFolder(s.hooksFolder);
        try {
          const result = await scanFolder(s.hooksFolder);
          setHookFiles(result.files);
        } catch { /* folder may no longer exist */ }
      }

      if (s.restsFolder) {
        setRestsFolder(s.restsFolder);
        try {
          const result = await scanFolder(s.restsFolder);
          setRestFiles(result.files);
        } catch { /* folder may no longer exist */ }
      }

      setLoaded(true);
    });
    loadOutputs();
  }, [loadOutputs]);

  // Auto-save settings when they change (debounced)
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSettings({ hooksFolder, restsFolder, context, hookDuration, variationsPerCombo });
    }, 500);
  }, [hooksFolder, restsFolder, context, hookDuration, variationsPerCombo, loaded]);

  return (
    <>
      <h1>Video Automation</h1>
      <p className="subtitle">
        Overlay hook clips onto content videos with AI-generated text
      </p>

      <div className="sections">
        <FolderPicker
          label="Hook Videos"
          description="Folder containing short hook clips"
          bucket="hooks"
          value={hooksFolder}
          files={hookFiles}
          onChange={(folder, files) => {
            setHooksFolder(folder);
            setHookFiles(files);
          }}
        />
        <FolderPicker
          label="Rest of Video"
          description="Folder containing main content videos (audio preserved)"
          bucket="rests"
          value={restsFolder}
          files={restFiles}
          onChange={(folder, files) => {
            setRestsFolder(folder);
            setRestFiles(files);
          }}
        />
      </div>

      <div className="config-section">
        <div className="config-row">
          <div className="config-field context-field">
            <label htmlFor="context">Hook Text Context</label>
            <textarea
              id="context"
              className="context-input"
              placeholder="Describe what the video is about so the AI generates relevant hook text. E.g. 'A tutorial about growing on TikTok using scheduling tools'"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
            />
          </div>
          <div className="config-field duration-field">
            <label htmlFor="duration">Hook Duration (s)</label>
            <input
              id="duration"
              type="number"
              className="duration-input"
              min={1}
              max={30}
              value={hookDuration}
              onChange={(e) => setHookDuration(Number(e.target.value))}
            />
            <p className="field-hint">
              Seconds of rest video visuals replaced by hook. Audio stays intact.
            </p>
          </div>
          <div className="config-field duration-field">
            <label htmlFor="variations">Variations per combo</label>
            <input
              id="variations"
              type="number"
              className="duration-input"
              min={1}
              max={20}
              value={variationsPerCombo}
              onChange={(e) => setVariationsPerCombo(Number(e.target.value))}
            />
            <p className="field-hint">
              Each hook x rest pair generates this many videos, each with unique
              text.
            </p>
          </div>
        </div>
      </div>

      <GenerateSection
        hooksFolder={hooksFolder}
        restsFolder={restsFolder}
        hookCount={hookFiles.length}
        restCount={restFiles.length}
        context={context}
        hookDuration={hookDuration}
        variationsPerCombo={variationsPerCombo}
        onDone={loadOutputs}
      />

      <OutputSection videos={outputs} onRefresh={loadOutputs} />

      <InstagramSection videos={outputs} />

      <AutoPostSection />
    </>
  );
}
