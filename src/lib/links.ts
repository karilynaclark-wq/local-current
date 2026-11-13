// In-app links (push data.url, notification rows): localcurrent://event/<id>,
// manage/<id>, thread/<redemptionId>, post, home. Also the
// https://www.localcurrentapp.com/open?to=<path> form used in emails.

export type AppLink = { kind: string; id?: string };

export function parseAppLink(url: string | null | undefined): AppLink | null {
  if (!url) return null;
  try {
    let path = url.replace(/^[a-z][\w.+-]*:\/\//i, '');
    const to = url.match(/[?&]to=([^&]+)/);
    if (/^https?:/.test(url)) { if (!to) return null; path = decodeURIComponent(to[1]); }
    const [kind, id] = path.replace(/^\/+/, '').split(/[/?#]/);
    return kind ? { kind, id } : null;
  } catch { return null; }
}

export const threadUrl = (redemptionId: string) => `localcurrent://thread/${redemptionId}`;
