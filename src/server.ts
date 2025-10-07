import express from "express";
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { nanoid } from "nanoid";
import { parseTimeToSeconds } from "./utils/time.js";
import { downloadClip } from "./services/ytdlp.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const ClipRequestSchema = z.object({
  url: z.string().url(),
  start: z.string(),
  end: z.string(),
  // Optional ways to pass cookies
  cookieHeader: z.string().min(1).optional(),
  cookiesTxtBase64: z.string().min(1).optional(),
  format: z.enum(["mp4", "webm"]).default("mp4"),
});

function isYouTubeUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return /(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname);
  } catch {
    return false;
  }
}

async function writeTempCookies(base64: string): Promise<string> {
  const buf = Buffer.from(base64, "base64");
  const dir = path.join(os.tmpdir(), "aiclips-cookies");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `cookies-${Date.now()}-${nanoid(6)}.txt`);
  await fs.writeFile(file, buf, { mode: 0o600 });
  return file;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/clip", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    const start = String(req.query.start || "");
    const end = String(req.query.end || "");
    const cookieHeader = req.query.cookieHeader ? String(req.query.cookieHeader) : undefined;

    const parsed = ClipRequestSchema.pick({ url: true, start: true, end: true }).parse({ url, start, end });
    if (!isYouTubeUrl(parsed.url)) {
      return res.status(400).json({ error: "Only YouTube URLs are supported" });
    }

    const startSeconds = parseTimeToSeconds(parsed.start);
    const endSeconds = parseTimeToSeconds(parsed.end);

    const baseName = `aiclips-${nanoid(8)}`;
    const outputDirectory = path.join(os.tmpdir(), "aiclips");

    const { outputPath } = await downloadClip({
      url: parsed.url,
      startSeconds,
      endSeconds,
      outputDirectory,
      outputBaseName: baseName,
      cookieHeader,
      format: "mp4",
    });

    const fileName = path.basename(outputPath);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);

    const stream = (await fs.open(outputPath, "r")).createReadStream();
    stream.pipe(res);

    const cleanup = async () => {
      try {
        await fs.unlink(outputPath);
      } catch {}
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
    res.on("finish", cleanup);
  } catch (err) {
    const message = (err as Error).message || String(err);
    if (/Sign in to confirm you’re not a bot|Use --cookies-from-browser|pass cookies to yt-dlp|Sign in to confirm you'?re not a bot/i.test(message)) {
      return res.status(401).json({
        error: "YouTube requires authentication. Pass cookieHeader or cookiesTxtBase64.",
        hint: "Export cookies.txt or forward your Cookie header for youtube.com",
        docs: "https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp",
      });
    }
    res.status(500).json({ error: message });
  }
});

app.post("/api/clip", async (req, res) => {
  try {
    const parsed = ClipRequestSchema.parse(req.body);
    if (!isYouTubeUrl(parsed.url)) {
      return res.status(400).json({ error: "Only YouTube URLs are supported" });
    }
    const startSeconds = parseTimeToSeconds(parsed.start);
    const endSeconds = parseTimeToSeconds(parsed.end);

    let cookiesTxtPath: string | undefined;
    if (parsed.cookiesTxtBase64) {
      cookiesTxtPath = await writeTempCookies(parsed.cookiesTxtBase64);
    }

    const baseName = `aiclips-${nanoid(8)}`;
    const outputDirectory = path.join(os.tmpdir(), "aiclips");

    const { outputPath } = await downloadClip({
      url: parsed.url,
      startSeconds,
      endSeconds,
      outputDirectory,
      outputBaseName: baseName,
      cookieHeader: parsed.cookieHeader,
      cookiesTxtPath,
      format: parsed.format,
    });

    const fileName = path.basename(outputPath);

    res.setHeader("Content-Type", parsed.format === "webm" ? "video/webm" : "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);

    const stream = (await fs.open(outputPath, "r")).createReadStream();
    stream.pipe(res);

    const cleanup = async () => {
      try {
        await fs.unlink(outputPath);
      } catch {}
      if (cookiesTxtPath) {
        try { await fs.unlink(cookiesTxtPath); } catch {}
      }
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
    res.on("finish", cleanup);
  } catch (err) {
    const message = (err as Error).message || String(err);
    if (/Sign in to confirm you’re not a bot|Use --cookies-from-browser|pass cookies to yt-dlp|Sign in to confirm you'?re not a bot/i.test(message)) {
      return res.status(401).json({
        error: "YouTube requires authentication. Pass cookieHeader or cookiesTxtBase64.",
        hint: "Export cookies.txt or forward your Cookie header for youtube.com",
        docs: "https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp",
      });
    }
    res.status(500).json({ error: message });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`AIClips backend listening on http://localhost:${port}`);
});
