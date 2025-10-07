import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { secondsToHms } from "../utils/time.js";

export type ClipOptions = {
  url: string;
  startSeconds: number;
  endSeconds: number;
  outputDirectory?: string;
  outputBaseName?: string;
  cookieHeader?: string; // Raw Cookie header for youtube.com
  cookiesTxtPath?: string; // Path to Netscape cookies.txt
  format?: "mp4" | "webm";
  userAgent?: string;
  timeoutMs?: number;
};

export type ClipResult = {
  outputPath: string;
  stdout: string;
  stderr: string;
};

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function buildYtDlpArgs(opts: Required<Pick<ClipOptions, "url" | "startSeconds" | "endSeconds" | "format">> &
  Pick<ClipOptions, "cookieHeader" | "cookiesTxtPath" | "userAgent">,
  outputPathWithoutExt: string): string[] {
  const start = secondsToHms(opts.startSeconds);
  const end = secondsToHms(opts.endSeconds);

  const args: string[] = [
    opts.url,
    "-f",
    "bv*+ba/b",
    "--no-playlist",
    "--no-progress",
    "--newline",
    "--force-keyframes-at-cuts",
    "--download-sections",
    `*${start}-${end}`,
    "-o",
    `${outputPathWithoutExt}.%(ext)s`,
  ];

  // Prefer remux to target format for consistent container
  if (opts.format === "mp4") {
    args.push("--remux-video", "mp4");
  } else if (opts.format === "webm") {
    args.push("--merge-output-format", "webm");
  }

  const ua = opts.userAgent || process.env.YOUTUBE_USER_AGENT || DEFAULT_UA;
  args.push("--add-header", `User-Agent: ${ua}`);
  args.push("--add-header", "Accept-Language: en-US,en;q=0.9");
  args.push("--add-header", "DNT: 1");

  const envCookieHeader = process.env.YOUTUBE_COOKIE_HEADER;
  const envCookiesFile = process.env.YT_COOKIES_FILE;

  const cookieHeader = opts.cookieHeader || envCookieHeader;
  const cookiesFile = opts.cookiesTxtPath || envCookiesFile;

  if (cookieHeader) {
    args.push("--add-header", `Cookie: ${cookieHeader}`);
  }
  if (cookiesFile) {
    args.push("--cookies", cookiesFile);
  }

  return args;
}

async function findProducedFile(outputDir: string, baseName: string): Promise<string | null> {
  const candidates = [
    `${baseName}.mp4`,
    `${baseName}.mkv`,
    `${baseName}.webm`,
    `${baseName}.mov`,
    `${baseName}.m4a`,
    `${baseName}.mp3`,
  ];
  for (const file of candidates) {
    const full = path.join(outputDir, file);
    try {
      await fs.access(full);
      return full;
    } catch {
      // continue
    }
  }
  // Fallback: scan directory
  const entries = await fs.readdir(outputDir);
  for (const entry of entries) {
    if (entry.startsWith(baseName + ".")) {
      return path.join(outputDir, entry);
    }
  }
  return null;
}

export async function downloadClip(opts: ClipOptions): Promise<ClipResult> {
  if (opts.endSeconds <= opts.startSeconds) {
    throw new Error("end must be greater than start");
  }

  const tmpRoot = opts.outputDirectory || path.join(os.tmpdir(), "aiclips");
  await fs.mkdir(tmpRoot, { recursive: true });

  const baseName = opts.outputBaseName || `aiclips-${Date.now()}`;
  const outputPathWithoutExt = path.join(tmpRoot, baseName);

  const args = buildYtDlpArgs(
    {
      url: opts.url,
      startSeconds: opts.startSeconds,
      endSeconds: opts.endSeconds,
      format: opts.format || "mp4",
      cookieHeader: opts.cookieHeader,
      cookiesTxtPath: opts.cookiesTxtPath,
      userAgent: opts.userAgent,
    },
    outputPathWithoutExt
  );

  const ytProcess = spawn("yt-dlp", args, { env: process.env });

  let stdout = "";
  let stderr = "";
  ytProcess.stdout.on("data", (d) => (stdout += d.toString()));
  ytProcess.stderr.on("data", (d) => (stderr += d.toString()));

  const exitCode: number = await new Promise((resolve, reject) => {
    let killedByTimeout = false;
    const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000; // 15 minutes default
    const timer = setTimeout(() => {
      killedByTimeout = true;
      ytProcess.kill("SIGKILL");
    }, Math.max(10_000, timeoutMs));

    ytProcess.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ytProcess.on("close", (code) => {
      clearTimeout(timer);
      if (killedByTimeout) {
        stderr += "\nTimed out while running yt-dlp";
      }
      resolve(code ?? -1);
    });
  });

  if (exitCode !== 0) {
    const combined = (stdout + "\n" + stderr).trim();
    throw new Error(combined || `yt-dlp exited with code ${exitCode}`);
  }

  const produced = await findProducedFile(path.dirname(outputPathWithoutExt), path.basename(outputPathWithoutExt));
  if (!produced) {
    throw new Error("Clip produced no output file");
  }

  return { outputPath: produced, stdout, stderr };
}
