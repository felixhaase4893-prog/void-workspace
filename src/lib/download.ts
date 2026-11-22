/** Saves text as a file on the user's device. Nothing leaves the browser. */
export function downloadTextFile(fileName: string, content: string, mimeType = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFileName(prefix: string, date: Date = new Date()): string {
  return `${prefix}-${date.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}
