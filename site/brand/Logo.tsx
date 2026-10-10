// 站点的字标和标记：页面用 Wordmark 画站名（size 是高度，单位像素），SiteMark 是站点标志（同目录的 logo.svg），
// RingMark 是一枚小齿轮，转起来就是加载动画。换 Logo 时替换 logo.svg，再用 node scripts/brand-icons.ts 重新生成位图图标。
import { SITE } from "../site.ts";
import logo from "./logo.svg?url&no-inline";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center leading-none ${className}`} style={{ fontSize: size }} aria-label={title} role="img">
      <SiteMark className="mr-[0.3em] size-[1.05em] shrink-0" />
      <span aria-hidden="true" className="font-display text-[1.3em] italic tracking-[-0.01em]">
        {SITE.name}
      </span>
    </span>
  );
}

/** The site mark: the icon, which carries its own dark rounded square. */
export function SiteMark({ className = "" }: { className?: string }) {
  return <img src={logo} alt="" width={32} height={32} decoding="async" className={className} />;
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
