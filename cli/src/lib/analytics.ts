const API_BASE = "https://api.planmode.org";

/**
 * Fire-and-forget download tracking. Never throws, never blocks.
 */
export function trackDownload(packageName: string): void {
  fetch(`${API_BASE}/downloads/${encodeURIComponent(packageName)}`, {
    method: "POST",
  }).catch(() => {
    // Silently ignore — analytics should never affect the install flow
  });
}
