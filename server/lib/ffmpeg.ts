import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const FONT_SIZE = 58;
const MAX_LINE_WIDTH = 28;
const Y_START = 80;

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

/**
 * Overlays the hook video onto the first `hookDuration` seconds of the rest video.
 *
 * Key behavior:
 * - The rest video's audio is kept FULLY intact (no trimming).
 * - The hook video's visuals REPLACE the first N seconds of the rest video's visuals.
 * - The rest video already has empty/black visuals for the first N seconds with music,
 *   so we overlay the hook on top of that.
 * - Text overlay appears only during the hook portion.
 * - Output duration = rest video duration (unchanged).
 */
export function combineVideos(
  hookPath: string,
  restPath: string,
  overlayText: string,
  outputPath: string,
  hookDuration: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const lines = wrapText(overlayText, MAX_LINE_WIDTH);

    const drawTextFilters = lines
      .map((line, i) => {
        const escaped = escapeDrawText(line);
        const y = Y_START + i * (FONT_SIZE + 12);
        return `drawtext=text='${escaped}':fontsize=${FONT_SIZE}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='between(t,0,${hookDuration})'`;
      })
      .join(",");

    ffmpeg()
      .input(hookPath)
      .input(restPath)
      .complexFilter([
        // Scale hook video to 1080x1920 (9:16), trim to hookDuration
        `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=0:${hookDuration},setpts=PTS-STARTPTS[hook]`,
        // Scale rest video to 1080x1920 (9:16, keep full duration)
        "[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[rest]",
        // Overlay hook on top of rest video for the first hookDuration seconds
        // Since both are 1080x1920, hook fully replaces rest visuals during that window
        `[rest][hook]overlay=0:0:enable='between(t,0,${hookDuration})'[with_hook]`,
        // Apply text overlay on the hook portion
        `[with_hook]${drawTextFilters}[vout]`,
      ])
      // Video from our filter chain, audio straight from the rest video (untouched)
      .outputOptions(["-map", "[vout]", "-map", "1:a"])
      .outputOptions(["-c:v", "libx264", "-preset", "fast", "-crf", "23"])
      .outputOptions(["-c:a", "aac", "-b:a", "128k"])
      .outputOptions(["-movflags", "+faststart"])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err: Error) =>
        reject(new Error(`FFmpeg error: ${err.message}`))
      )
      .run();
  });
}
