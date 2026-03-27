import { Router } from "express";
import path from "path";
import fs from "fs";
import {
  exchangeForLongLivedToken,
  getInstagramAccountId,
  publishReel,
} from "../lib/instagram";

const router = Router();

const SETTINGS_FILE = path.join(__dirname, "..", "..", "settings.json");
const outputDir = path.join(__dirname, "..", "..", "output");

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(update: Record<string, unknown>) {
  const current = loadSettings();
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify({ ...current, ...update }, null, 2)
  );
}

// Exchange short-lived token for long-lived token and discover IG account
router.post("/connect", async (req, res) => {
  const body = req.body as {
    appId?: string;
    appSecret?: string;
    shortLivedToken?: string;
  };

  // Fall back to env vars if not provided in body
  const appId = body.appId || process.env.IG_APP_ID || "";
  const appSecret = body.appSecret || process.env.IG_APP_SECRET || "";
  const shortLivedToken = body.shortLivedToken || process.env.IG_SHORT_LIVED_TOKEN || "";

  if (!appId || !appSecret || !shortLivedToken) {
    res
      .status(400)
      .json({ error: "appId, appSecret, and shortLivedToken are required." });
    return;
  }

  try {
    // Exchange for long-lived token
    const tokenData = await exchangeForLongLivedToken(
      appId,
      appSecret,
      shortLivedToken
    );

    // Discover Instagram Business Account
    const igAccount = await getInstagramAccountId(tokenData.access_token);

    // Save credentials
    saveSettings({
      igAppId: appId,
      igAppSecret: appSecret,
      igAccessToken: tokenData.access_token,
      igUserId: igAccount.id,
      igUsername: igAccount.username || "",
    });

    res.json({
      success: true,
      username: igAccount.username,
      igUserId: igAccount.id,
      expiresIn: tokenData.expires_in,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// Auto-connect using env vars (no body needed)
router.post("/connect-env", async (_req, res) => {
  const appId = process.env.IG_APP_ID || "";
  const appSecret = process.env.IG_APP_SECRET || "";
  const longLivedToken = process.env.IG_LONG_LIVED_TOKEN || "";
  const shortLivedToken = process.env.IG_SHORT_LIVED_TOKEN || "";

  // Prefer long-lived token if available, otherwise exchange short-lived
  const accessToken = longLivedToken || "";

  if (!accessToken && (!appId || !appSecret || !shortLivedToken)) {
    res.status(400).json({ error: "Set IG_LONG_LIVED_TOKEN (or IG_APP_ID + IG_APP_SECRET + IG_SHORT_LIVED_TOKEN) in .env" });
    return;
  }

  try {
    let finalToken = accessToken;
    if (!finalToken) {
      const tokenData = await exchangeForLongLivedToken(appId, appSecret, shortLivedToken);
      finalToken = tokenData.access_token;
    }
    const igAccount = await getInstagramAccountId(finalToken);
    saveSettings({
      igAccessToken: finalToken,
      igUserId: igAccount.id,
      igUsername: igAccount.username || "",
    });
    res.json({ success: true, username: igAccount.username, igUserId: igAccount.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// Get current connection status
router.get("/status", (_req, res) => {
  const settings = loadSettings();
  if (settings.igAccessToken && settings.igUserId) {
    res.json({
      connected: true,
      username: settings.igUsername || "",
      igUserId: settings.igUserId,
    });
  } else {
    res.json({ connected: false });
  }
});

// Disconnect (clear credentials)
router.post("/disconnect", (_req, res) => {
  saveSettings({
    igAppId: "",
    igAppSecret: "",
    igAccessToken: "",
    igUserId: "",
    igUsername: "",
  });
  res.json({ disconnected: true });
});

// Publish a video to Instagram as a Reel
router.post("/publish", async (req, res) => {
  const { filename, caption } = req.body as {
    filename: string;
    caption: string;
  };

  if (!filename) {
    res.status(400).json({ error: "filename is required." });
    return;
  }

  const settings = loadSettings();
  if (!settings.igAccessToken || !settings.igUserId) {
    res
      .status(400)
      .json({ error: "Instagram not connected. Connect first." });
    return;
  }

  const videoPath = path.join(outputDir, filename);
  if (!fs.existsSync(videoPath)) {
    res.status(404).json({ error: `Video not found: ${filename}` });
    return;
  }

  try {
    const result = await publishReel(
      settings.igUserId,
      settings.igAccessToken,
      videoPath,
      caption || ""
    );
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

export { router as instagramRouter };
