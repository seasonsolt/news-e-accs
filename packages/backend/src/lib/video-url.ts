// Only MP4 files from X's video CDN can be signed for inline X playback.
export function isXVideoUrl(input: string): boolean {
  const url = URL.parse(input);
  return url?.origin === "https://video.twimg.com" && !url.username && !url.password && !url.hash
    && /^\/(?:amplify_video|ext_tw_video|tweet_video)\/.+\.mp4$/i.test(url.pathname);
}

// Video watch/share/embed addresses name players, whose controls and recommendations are not articles.
export function isVideoPageUrl(input: string): boolean {
  let url: URL;
  try { url = new URL(input); } catch { return false; }
  if (!/^https?:$/.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (/^(?:www\.|m\.)?youtube\.com$/.test(host)) {
    return (/^\/watch\/?$/.test(url.pathname) && !!url.searchParams.get("v")) || /^\/(?:shorts|embed|v)\/[^/]+\/?$/.test(url.pathname);
  }
  if (host === "youtu.be") return /^\/[^/]+\/?$/.test(url.pathname);
  if (host === "vimeo.com" || host === "www.vimeo.com") return /^\/\d+(?:\/[a-zA-Z0-9]+)?\/?$/.test(url.pathname);
  return host === "player.vimeo.com" && /^\/video\/\d+\/?$/.test(url.pathname);
}

/** A video file or stream (MP4, WebM, MOV, HLS, DASH), which no image renderer can draw. */
export function isVideoFileUrl(input: string): boolean {
  let url: URL;
  try { url = new URL(input); } catch { return false; }
  return url.hostname === "video.twimg.com" || /\.(?:mp4|m4v|webm|mov|m3u8|mpd)$/i.test(url.pathname);
}

/**
 * The still X keeps beside a GIF post's video (tweet_video/<id>.mp4 → tweet_video_thumb/<id>.jpg).
 * Other X videos name their still with a token of its own, so only the post's data can give it.
 */
export function xVideoStill(input: string): string | null {
  const m = /^https:\/\/video\.twimg\.com\/tweet_video\/([A-Za-z0-9_-]+)\.mp4$/.exec(input);
  return m ? `https://pbs.twimg.com/tweet_video_thumb/${m[1]}.jpg` : null;
}

/** A video's still: its poster unless that is the video itself, else the still X keeps for a GIF. */
export function videoStill(media: { url: string; poster?: string | null }): string | null {
  if (media.poster && !isVideoFileUrl(media.poster)) return media.poster;
  return isVideoFileUrl(media.url) ? xVideoStill(media.url) : media.url;
}
