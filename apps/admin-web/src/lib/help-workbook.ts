/** Accept document URLs that desktop Excel can retrieve over HTTPS. */
export function normalizeHelpWorkbookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a complete HTTPS link to the Excel workbook.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Use an HTTPS workbook link without a username or password in the URL.');
  }
  // Pipes delimit commands in Office URI schemes; encode pipes in the document URL.
  return url.href.replace(/\|/g, '%7C');
}

export function desktopExcelWorkbookUrl(value: string): string {
  return `ms-excel:ofv|u|${normalizeHelpWorkbookUrl(value)}`;
}
