// The 公众号's own API (api.weixin.qq.com), for putting 「AI 早报」 into the account's draft box. Free calls,
// so not receipted. They go out directly, never through the egress proxy: the account only answers
// addresses on its IP allowlist. Personal and unverified accounts may add drafts but not publish them;
// publishing stays a person's click in the 公众号 backend.
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";

export class WechatApiError extends Error {
  readonly errcode: number | null;
  constructor(message: string, errcode: number | null) {
    super(message);
    this.errcode = errcode;
  }
}

/** The account's answers that mean the setup, not the request, is wrong; shown to the editor as such. */
export const WECHAT_SETUP_ERRORS: Record<number, string> = {
  40013: "AppID 不对",
  40125: "AppSecret 不对",
  40164: "服务器 IP 不在公众号的 IP 白名单里",
  48001: "这个公众号没有草稿箱接口的权限",
  61004: "服务器 IP 不在公众号的 IP 白名单里",
};

/** Whether the AppID and AppSecret are present (the WECHAT_DRAFT_ENABLED valve is separate). */
export function wechatConfigured(): boolean {
  return !!credential("integrations", "WECHAT_APPID") && !!credential("integrations", "WECHAT_APPSECRET");
}

const base = () => (credential("integrations", "WECHAT_API_BASE_URL") ?? "https://api.weixin.qq.com").replace(/\/$/, "");

async function call(path: string, init: { body?: string | Uint8Array; headers?: Record<string, string> } = {}): Promise<Record<string, any>> {
  let res;
  try {
    res = await guardedFetch(`${base()}${path}`, {
      method: init.body === undefined ? "GET" : "POST", headers: { accept: "application/json", ...init.headers }, body: init.body,
      timeoutMs: 30_000, maxBytes: 4 * 1024 * 1024, route: "direct",
    });
  } catch (error) {
    throw new WechatApiError(`公众号接口连不上：${String(error).slice(0, 200)}`, null);
  }
  let json: Record<string, any> | null = null;
  try {
    json = JSON.parse(res.text());
  } catch {
    json = null;
  }
  if (!json || res.status >= 400) throw new WechatApiError(`公众号接口回答异常（HTTP ${res.status}）`, null);
  if (json.errcode) {
    const code = Number(json.errcode);
    throw new WechatApiError(WECHAT_SETUP_ERRORS[code] ?? `公众号接口报错 ${code}：${String(json.errmsg ?? "").slice(0, 200)}`, code);
  }
  return json;
}

const json = (value: unknown) => ({ body: JSON.stringify(value), headers: { "content-type": "application/json" } });

let token: { value: string; until: number } | null = null;

/** The stable access token: asking again does not invalidate the one other tools of the account hold. */
async function accessToken(): Promise<string> {
  if (token && Date.now() < token.until) return token.value;
  const appid = credential("integrations", "WECHAT_APPID");
  const secret = credential("integrations", "WECHAT_APPSECRET");
  if (!appid || !secret) throw new WechatApiError("没有配置 WECHAT_APPID 和 WECHAT_APPSECRET", null);
  const res = await call("/cgi-bin/stable_token", json({ grant_type: "client_credential", appid, secret, force_refresh: false }));
  // Renewed five minutes early, so a token never expires between two calls of one push.
  token = { value: String(res.access_token), until: Date.now() + (Number(res.expires_in) - 300) * 1000 };
  return token.value;
}

/** Forgets the cached token (tests switch accounts). */
export function resetWechatToken() {
  token = null;
}

/** A permanent image (the draft API takes covers only as permanent material); its media_id. */
export async function uploadWechatImage(png: Buffer, filename: string): Promise<string> {
  const boundary = `----aihot${Date.now().toString(16)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await call(`/cgi-bin/material/add_material?access_token=${await accessToken()}&type=image`, {
    body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  });
  return String(res.media_id);
}

export interface WechatDraftArticle {
  title: string;
  author: string;
  digest: string;
  content: string;
  content_source_url: string;
  thumb_media_id: string;
  need_open_comment: 0 | 1;
  only_fans_can_comment: 0 | 1;
  pic_crop_235_1: string;
  pic_crop_1_1: string;
}

/** A new draft holding one article; its media_id. */
export async function addWechatDraft(article: WechatDraftArticle): Promise<string> {
  const res = await call(`/cgi-bin/draft/add?access_token=${await accessToken()}`, json({ articles: [article] }));
  return String(res.media_id);
}

/** Replaces the article of a draft; false when the draft is gone (published or deleted in the backend). */
export async function updateWechatDraft(mediaId: string, article: WechatDraftArticle): Promise<boolean> {
  try {
    await call(`/cgi-bin/draft/update?access_token=${await accessToken()}`, json({ media_id: mediaId, index: 0, articles: article }));
    return true;
  } catch (error) {
    // 40007: no such media_id; the draft box no longer holds it.
    if (error instanceof WechatApiError && error.errcode === 40007) return false;
    throw error;
  }
}
