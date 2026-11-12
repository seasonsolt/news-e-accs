import { Text, useLocale, useTranslate } from "../../lib/i18n";
// A server-rendered share picture (an article's poster with its QR code, a daily's card), to save or hand
// to the system share sheet. Loaded on demand; a bottom sheet on phones, centred above.
import { useEffect, useState } from "react";
import { SITE } from "@aihot/site";
import { Sheet } from "../../components/ui/Sheet";
import { IconDownload, IconShare } from "../../components/icons";
import { recordEngagement } from "../../lib/engagement";

export default function PosterSheet({ path, name, title, heading = "分享海报", wide = false, open, onClose }: {
  /** The picture's path without the language, "/og/posters/<id>.png". */
  path: string;
  /** The saved file's name without the extension. */
  name: string;
  title: string;
  heading?: string;
  /** A 1200×630 card rather than a 3:4 poster. */
  wide?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const tx = useTranslate();
  const src = `${path}?lang=${useLocale()}`;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canShareFile, setCanShareFile] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      setCanShareFile(!!navigator.canShare?.({ files: [new File([], "p.png", { type: "image/png" })] }));
    } catch {
      setCanShareFile(false);
    }
  }, [open]);

  async function share() {
    try {
      const blob = await (await fetch(src)).blob();
      await navigator.share({ files: [new File([blob], `${SITE.mcpPrefix}-${name}.png`, { type: "image/png" })], title });
      recordEngagement("share_click");
    } catch {
      // cancelled or unsupported: saving stays available
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={tx(heading)} centered>
      <div className="flex flex-col items-center px-5 sm:px-7">
        <div className={`relative w-full overflow-hidden rounded-card border border-line bg-bg-sunk ${wide ? "aspect-[1200/630] max-w-[560px]" : "aspect-[3/4] max-w-[min(360px,calc((88dvh-200px)*0.75))]"}`}>
          {!loaded && !failed && <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%]" />}
          {failed ? (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-ink-3"><Text value="海报生成失败，请稍后再试。" /></p>
          ) : (
            <img
              src={src}
              alt={`${title} · ${tx(heading)}`}
              className={`size-full object-contain transition-[opacity,transform] duration-[250ms] ${loaded ? "scale-100 opacity-100" : "scale-[0.985] opacity-0"}`}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          )}
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3"><Text value="长按图片可保存或发送给朋友" /></p>
        <div className="mt-3 flex w-full max-w-[360px] gap-2">
          <a
            href={src}
            download={`${SITE.mcpPrefix}-${name}.png`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent text-[14px] font-medium text-accent-contrast transition-colors hover:bg-accent-ink lg:h-10 sm:text-[13.5px]"
          >
            <IconDownload size={15} /><Text value="保存图片" /></a>
          {canShareFile && (
            <button type="button" onClick={share} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface text-[14px] font-medium text-ink transition-colors hover:border-ink-4 lg:h-10 sm:text-[13.5px]">
              <IconShare size={15} /><Text value="分享" /></button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
