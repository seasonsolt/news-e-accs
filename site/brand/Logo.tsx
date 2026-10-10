// 站点的字标和圆环标记：页面用 Wordmark 画站名（size 是高度，单位像素），RingMark 是小标记，转起来就是加载动画。
// 这里用站名（site.ts，用斜体衬线体排）加一枚黄铜齿轮；有自己的 Logo 时，把 Wordmark 换成你的 SVG（保持同样的参数）。
import { SITE } from "../site.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center leading-none ${className}`} style={{ fontSize: size }} aria-label={title} role="img">
      <RingMark className="mr-[0.3em] size-[0.8em] text-accent" />
      <span aria-hidden="true" className="font-display text-[1.3em] italic tracking-[-0.01em]">
        {SITE.name}
      </span>
    </span>
  );
}

/** A ten-tooth gear (teeth are a dashed thick ring round the hub); spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.6s linear infinite" } : undefined}>
        {/* circumference 2π·9.6 ≈ 60.3, so a 3.016 dash and gap give ten even teeth */}
        <circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeDasharray="3.016 3.016" />
        <circle cx="12" cy="12" r="6.6" fill="none" stroke="currentColor" strokeWidth="3" />
      </g>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  );
}
