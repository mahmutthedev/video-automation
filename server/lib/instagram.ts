import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const GRAPH_API = "https://graph.facebook.com/v22.0";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface IGAccount {
  id: string;
  username?: string;
}

interface ContainerResponse {
  id: string;
  uri?: string;
}

interface StatusResponse {
  id: string;
  status_code: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
  status?: string;
}

interface PublishResponse {
  id: string;
}

/**
 * Exchange a short-lived token for a long-lived one (~60 days).
 */
export async function exchangeForLongLivedToken(
  appId: string,
  appSecret: string,
  shortLivedToken: string
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${GRAPH_API}/oauth/access_token?${params}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(
      `Token exchange failed: ${err.error?.message || JSON.stringify(err)}`
    );
  }
  return res.json();
}

/**
 * Get the Instagram Business Account ID.
 * Tries three approaches in order:
 * 1. /me/accounts (Facebook Pages with linked IG accounts)
 * 2. Token debug — extract IG account ID from granular_scopes (instagram_basic)
 * 3. Fallback page ID via IG_PAGE_ID env var
 */
export async function getInstagramAccountId(
  accessToken: string,
  fallbackPageId?: string
): Promise<IGAccount> {
  // Try auto-discovery via /me/accounts first
  const pagesRes = await fetch(
    `${GRAPH_API}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${accessToken}`
  );

  if (pagesRes.ok) {
    const pages = (await pagesRes.json()) as {
      data: {
        id: string;
        name: string;
        instagram_business_account?: { id: string; username: string };
      }[];
    };

    for (const page of pages.data) {
      if (page.instagram_business_account) {
        return {
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username,
        };
      }
    }
  }

  // Fallback: extract IG account ID from token debug granular_scopes
  const debugRes = await fetch(
    `${GRAPH_API}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
  );
  if (debugRes.ok) {
    const debug = (await debugRes.json()) as {
      data?: {
        granular_scopes?: { scope: string; target_ids?: string[] }[];
      };
    };
    const igScope = debug.data?.granular_scopes?.find(
      (s) => s.scope === "instagram_basic" && s.target_ids?.length
    );
    if (igScope?.target_ids?.[0]) {
      const igId = igScope.target_ids[0];
      const igRes = await fetch(
        `${GRAPH_API}/${igId}?fields=id,username&access_token=${accessToken}`
      );
      if (igRes.ok) {
        const ig = (await igRes.json()) as { id: string; username?: string };
        if (ig.id) return { id: ig.id, username: ig.username };
      }
    }
  }

  // Fallback: query a specific Page ID directly
  const pageId = fallbackPageId || process.env.IG_PAGE_ID;
  if (pageId) {
    const pageRes = await fetch(
      `${GRAPH_API}/${pageId}?fields=id,name,instagram_business_account{id,username}&access_token=${accessToken}`
    );
    if (pageRes.ok) {
      const page = (await pageRes.json()) as {
        id: string;
        name: string;
        instagram_business_account?: { id: string; username: string };
      };
      if (page.instagram_business_account) {
        return {
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username,
        };
      }
    }
  }

  throw new Error(
    "No Instagram Business Account found. Make sure your Instagram is a Business/Creator account and the token has instagram_basic permission."
  );
}

/**
 * Publish a local video file as an Instagram Reel using resumable upload.
 *
 * Flow:
 * 1. Initialize a resumable upload container
 * 2. Upload the video binary to the returned URI
 * 3. Poll until the container status is FINISHED
 * 4. Publish the container
 */
export async function publishReel(
  igUserId: string,
  accessToken: string,
  videoPath: string,
  caption: string
): Promise<{ containerId: string; mediaId: string }> {
  const absolutePath = path.resolve(videoPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Video file not found: ${absolutePath}`);
  }

  // Step 1: Initialize resumable upload
  const initRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      upload_type: "resumable",
      caption,
      access_token: accessToken,
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.json();
    throw new Error(
      `Failed to initialize upload: ${err.error?.message || JSON.stringify(err)}`
    );
  }

  const container = (await initRes.json()) as ContainerResponse;
  const uploadUri = container.uri;

  if (!uploadUri) {
    throw new Error("No upload URI returned from Instagram API.");
  }

  // Step 2: Upload the video binary via streaming (Transfer-Encoding: chunked)
  const uploadRes = await postFileStream(
    uploadUri,
    {
      Authorization: `OAuth ${accessToken}`,
      offset: "0",
      "Content-Type": "application/octet-stream",
    },
    absolutePath
  );

  if (!uploadRes.ok) {
    throw new Error(`Video upload failed: ${uploadRes.text}`);
  }

  // Step 3: Poll until container is ready
  const containerId = container.id;
  let status: StatusResponse | undefined;
  const maxAttempts = 60; // up to ~5 minutes

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);

    const statusRes = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    status = (await statusRes.json()) as StatusResponse;

    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(
        `Container processing failed: ${status.status_code} — ${status.status || "unknown error"}`
      );
    }
    // IN_PROGRESS — keep polling
  }

  if (status?.status_code !== "FINISHED") {
    throw new Error("Timed out waiting for Instagram to process the video.");
  }

  // Step 4: Publish
  const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.json();
    throw new Error(
      `Failed to publish: ${err.error?.message || JSON.stringify(err)}`
    );
  }

  const published = (await publishRes.json()) as PublishResponse;
  return { containerId, mediaId: published.id };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stream a file via POST — uses Transfer-Encoding: chunked which Meta accepts */
function postFileStream(
  uri: string,
  headers: Record<string, string>,
  filePath: string
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(uri);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () =>
          resolve({ ok: (res.statusCode ?? 500) < 400, status: res.statusCode ?? 500, text: body })
        );
      }
    );
    req.on("error", reject);
    fs.createReadStream(filePath).pipe(req);
  });
}
