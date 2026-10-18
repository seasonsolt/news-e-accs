// The cover of a 「AI 早报」 issue: 2.35:1 as the 公众号 article list shows it, with the column name,
// date and issue number in its left square, which is the 1:1 crop shown where the list is square.
// Rendered like the share images (og.ts), on the deck the article opens with in the issue's theme, and
// cached on disk by content.
import { WECHAT_COVER, wechatCoverEtag, type WechatCover } from "./cards.ts";
export { WECHAT_COVER, WECHAT_COVER_SQUARE, WECHAT_COVER_WIDE, wechatCoverEtag, type WechatCover } from "./cards.ts";
import { clamp, h, nameMark, renderPng, SITE_HOST } from "./og.ts";
import { WECHAT_COLUMN, WECHAT_THEMES } from "../newsletter/wechat.ts";

function tree(cover: WechatCover) {
  const C = WECHAT_THEMES[cover.theme].palette;
  const [, m, d] = cover.date.split("-");
  const headline = clamp(cover.headline, 48);
  const size = [...headline].length > 32 ? 44 : [...headline].length > 18 ? 52 : 60;
  return Promise.resolve(h(
    "div",
    {
      width: WECHAT_COVER.width, height: WECHAT_COVER.height, display: "flex", fontFamily: "Noto Sans SC",
      backgroundColor: C.deck, backgroundImage: `radial-gradient(circle at 0% 100%, ${C.heat}40, ${C.heat}00 60%)`, color: C.deckInk,
    },
    [
      h("div", {
        width: WECHAT_COVER.height, height: WECHAT_COVER.height, display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: "center", borderRight: `2px solid ${C.brass}`,
      }, [
        h("div", { display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: 4 }, WECHAT_COLUMN),
        h("div", { display: "flex", marginTop: 18, fontSize: 112, fontWeight: 700, lineHeight: 1, color: C.heatHi }, `${m}.${d}`),
        h("div", { display: "flex", marginTop: 26, fontSize: 30, letterSpacing: 6, color: C.deckDim }, `第 ${cover.issueNumber} 期`),
      ]),
      h("div", { display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "56px 60px" }, [
        h("div", { display: "flex", alignItems: "center" }, [
          h("div", { width: 36, height: 3, borderRadius: 2, backgroundColor: C.heat, marginRight: 16 }),
          h("div", { display: "flex", fontSize: 26, fontWeight: 700, color: C.heat, letterSpacing: 6 }, "今日头条"),
        ]),
        h("div", { display: "flex", fontSize: size, fontWeight: 700, lineHeight: 1.3 }, headline),
        h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
          nameMark(30, C.deckInk, C.heat),
          h("div", { display: "flex", fontSize: 24, color: C.deckDim }, SITE_HOST),
        ]),
      ]),
    ],
  ));
}

/** PNG bytes of a cover, from the disk cache when this exact cover was rendered before. */
export async function renderWechatCover(cover: WechatCover): Promise<{ png: Buffer; etag: string }> {
  const etag = wechatCoverEtag(cover);
  return { png: await renderPng(`wechat-${etag}`, WECHAT_COVER, () => tree(cover)), etag };
}
