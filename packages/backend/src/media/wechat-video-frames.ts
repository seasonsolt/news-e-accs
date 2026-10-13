// The frames of the 视频号 「AI 早报」 video, 1080×1920: a title card, one card per entry (its number,
// label, source, headline and illustration) and a closing card, each with the sentence being spoken as
// a subtitle. Laid out like the 公众号 cover (wechat-cover.ts) on the deck of the issue's theme, and kept
// clear of the top and bottom bands 视频号 covers with its own controls. Rendered with satori like the
// share images (og.ts), but not cached: scripts/wechat-video.ts renders each frame once.
import satori from "satori";
import sharp from "sharp";
import { clamp, fonts, h, nameMark, SITE_HOST, type Node } from "./og.ts";
import { WECHAT_COLUMN, WECHAT_THEMES, type WechatTheme } from "../newsletter/wechat.ts";

export const VIDEO_SIZE = { width: 1080, height: 1920 } as const;
/** The bands 视频号 lays its own name, caption and buttons over; nothing that must be read goes there. */
const SAFE_TOP = 170;
const SAFE_BOTTOM = 420;

interface Common {
  theme: WechatTheme;
  date: string;
  /** The sentence spoken while this frame shows. */
  subtitle: string;
}

export type VideoFrame =
  | (Common & { kind: "opening"; issueNumber: number; headlines: string[] })
  | (Common & { kind: "entry"; number: number; total: number; section: string; sourceName: string; title: string; image: Buffer | null })
  | (Common & { kind: "closing" });

const pad = (n: number) => String(n).padStart(2, "0");

function frame(f: VideoFrame): Node {
  const C = WECHAT_THEMES[f.theme].palette;
  const [, m, d] = f.date.split("-");
  const header = h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
    nameMark(40, C.deckInk, C.heat),
    h("div", { display: "flex", fontSize: 34, fontWeight: 700, color: C.deckDim, letterSpacing: 4 }, `${WECHAT_COLUMN} · ${m}.${d}`),
  ]);
  const subtitle = h("div", {
    display: "flex", justifyContent: "center", padding: "28px 36px", borderRadius: 24, backgroundColor: "rgba(0,0,0,0.45)",
    fontSize: 50, fontWeight: 700, lineHeight: 1.45, color: "#ffffff", textAlign: "center",
  }, clamp(f.subtitle, 60));
  let body: Node[];
  if (f.kind === "opening") {
    body = [
      h("div", { display: "flex", flexDirection: "column", alignItems: "flex-start" }, [
        h("div", { display: "flex", fontSize: 120, fontWeight: 700, letterSpacing: 6, color: C.deckInk }, WECHAT_COLUMN),
        h("div", { display: "flex", marginTop: 24, fontSize: 180, fontWeight: 700, lineHeight: 1, color: C.heatHi }, `${m}.${d}`),
        h("div", { display: "flex", marginTop: 28, fontSize: 40, letterSpacing: 8, color: C.deckDim }, `第 ${f.issueNumber} 期`),
      ]),
      h("div", { display: "flex", flexDirection: "column", marginTop: 56, paddingTop: 36, borderTop: `3px solid ${C.brass}` },
        f.headlines.map((t, k) => h("div", { display: "flex", marginTop: k ? 18 : 0, fontSize: 36, lineHeight: 1.35, color: C.deckInk }, [
          h("div", { display: "flex", width: 68, flexShrink: 0, fontWeight: 700, color: C.heat }, pad(k + 1)),
          h("div", { display: "flex", flex: 1 }, clamp(t, 36)),
        ]))),
    ];
  } else if (f.kind === "entry") {
    const title = clamp(f.title, 54);
    body = [
      h("div", { display: "flex", alignItems: "flex-end" }, [
        h("div", { display: "flex", fontSize: 150, fontWeight: 700, lineHeight: 1, color: C.heatHi }, pad(f.number)),
        h("div", { display: "flex", marginLeft: 18, marginBottom: 12, fontSize: 44, color: C.deckDim }, `/ ${pad(f.total)}`),
      ]),
      h("div", { display: "flex", alignItems: "center", marginTop: 34, fontSize: 34, color: C.deckDim }, [
        h("div", { display: "flex", padding: "6px 18px", borderRadius: 12, backgroundColor: C.brass, color: C.deckInk, fontWeight: 700, marginRight: 22 }, clamp(f.section, 8)),
        h("div", { display: "flex" }, clamp(f.sourceName, 24)),
      ]),
      h("div", { display: "flex", marginTop: 34, fontSize: [...title].length > 36 ? 62 : 72, fontWeight: 700, lineHeight: 1.3, color: C.deckInk }, title),
      f.image
        ? h("img", { marginTop: 48, width: 960, height: 540, borderRadius: 28, objectFit: "cover" }, undefined, { src: `data:image/jpeg;base64,${f.image.toString("base64")}`, width: 960, height: 540 })
        : h("div", { display: "flex", marginTop: 48, width: 960, height: 6, borderRadius: 3, backgroundImage: `linear-gradient(90deg, ${C.heat}, ${C.heat}00)` }),
    ];
  } else {
    body = [
      h("div", { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 220 }, [
        nameMark(96, C.deckInk, C.heat),
        h("div", { display: "flex", marginTop: 40, fontSize: 48, letterSpacing: 6, color: C.heatHi }, SITE_HOST),
        h("div", { display: "flex", marginTop: 28, fontSize: 36, color: C.deckDim }, `${WECHAT_COLUMN}每天 08:00 更新`),
      ]),
    ];
  }
  return h("div", {
    width: VIDEO_SIZE.width, height: VIDEO_SIZE.height, display: "flex", flexDirection: "column", justifyContent: "space-between",
    padding: `${SAFE_TOP}px 60px ${SAFE_BOTTOM}px`, fontFamily: "Noto Sans SC", color: C.deckInk, backgroundColor: C.deck,
    backgroundImage: `radial-gradient(circle at 100% 0%, ${C.heat}38, ${C.heat}00 55%), radial-gradient(circle at 0% 100%, ${C.heat}30, ${C.heat}00 50%)`,
  }, [
    h("div", { display: "flex", flexDirection: "column" }, [header, h("div", { display: "flex", flexDirection: "column", marginTop: 90 }, body)]),
    subtitle,
  ]);
}

/** PNG bytes of one frame. */
export async function renderVideoFrame(f: VideoFrame): Promise<Buffer> {
  const svg = await satori(frame(f) as never, { ...VIDEO_SIZE, fonts: await fonts() });
  return sharp(Buffer.from(svg)).png().toBuffer();
}
