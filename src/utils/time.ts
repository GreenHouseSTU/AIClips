export function parseTimeToSeconds(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Time is empty");

  // Numeric seconds, possibly decimal
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // 1h2m3s, 2m10s, 45s, 1h
  const unitMatch = trimmed.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (unitMatch) {
    const hours = parseFloat(unitMatch[1] ?? "0");
    const minutes = parseFloat(unitMatch[2] ?? "0");
    const seconds = parseFloat(unitMatch[3] ?? "0");
    const total = hours * 3600 + minutes * 60 + seconds;
    if (total > 0) return total;
  }

  // hh:mm:ss or mm:ss
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => p.trim());
    if (parts.some((p) => p === "")) throw new Error("Invalid time format");
    if (parts.length === 2) {
      const [mm, ss] = parts.map(parseFloat);
      if (Number.isFinite(mm) && Number.isFinite(ss)) return mm * 60 + ss;
    } else if (parts.length === 3) {
      const [hh, mm, ss] = parts.map(parseFloat);
      if (Number.isFinite(hh) && Number.isFinite(mm) && Number.isFinite(ss)) return hh * 3600 + mm * 60 + ss;
    }
  }

  throw new Error(`Unsupported time format: ${input}`);
}

export function secondsToHms(secondsInput: number): string {
  const seconds = Math.max(0, Math.floor(secondsInput));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
