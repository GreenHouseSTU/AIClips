"use client";

import React, { useCallback, useMemo, useState } from "react";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ClipForm() {
  const [url, setUrl] = useState("");
  const [start, setStart] = useState("0:00");
  const [end, setEnd] = useState("");
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [cookieHeader, setCookieHeader] = useState("");
  const [cookiesFile, setCookiesFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return !!url && !!start && !!end && !busy;
  }, [url, start, end, busy]);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload: any = { url, start, end, format };

      if (cookieHeader.trim()) {
        payload.cookieHeader = cookieHeader.trim();
      }

      if (cookiesFile) {
        const fileData = await cookiesFile.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(fileData)));
        payload.cookiesTxtBase64 = base64;
      }

      const resp = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        let err = "Request failed";
        try {
          const data = await resp.json();
          err = data.error || err;
        } catch {}
        setMessage(err);
        return;
      }

      const disposition = resp.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `aiclips-clip.${format}`;

      const blob = await resp.blob();
      downloadBlob(blob, filename);
      setMessage("Downloaded");
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setBusy(false);
    }
  }, [url, start, end, format, cookieHeader, cookiesFile]);

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <label>
        <div>YouTube URL</div>
        <input
          type="url"
          required
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: "100%" }}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label>
          <div>Start</div>
          <input
            type="text"
            required
            placeholder="e.g. 0:05 or 1m2s"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          <div>End</div>
          <input
            type="text"
            required
            placeholder="e.g. 0:12 or 2m10s"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>

      <label>
        <div>Format</div>
        <select value={format} onChange={(e) => setFormat(e.target.value as any)}>
          <option value="mp4">MP4</option>
          <option value="webm">WebM</option>
        </select>
      </label>

      <details>
        <summary>Authentication (optional)</summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <label>
            <div>Cookie header</div>
            <input
              type="text"
              placeholder="name=value; name2=value2"
              value={cookieHeader}
              onChange={(e) => setCookieHeader(e.target.value)}
            />
          </label>
          <label>
            <div>cookies.txt (Netscape) file</div>
            <input
              type="file"
              accept=".txt"
              onChange={(e) => setCookiesFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>
      </details>

      <button type="submit" disabled={!canSubmit}>
        {busy ? "Downloading…" : "Download clip"}
      </button>

      {message && <div role="status">{message}</div>}
    </form>
  );
}
