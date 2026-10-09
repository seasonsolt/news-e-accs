// A page's observation deck: the dark band under the site's top bar, an illustration plate behind it
// with a heat glow, then the page's kicker, title and description, an optional instrument on the right
// (the time-machine dial, a meter) and an optional row below (tabs, figures). Dark in either theme.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMotionAllowed } from "../../features/motion/preferences";

/** An illustration under /media/art/ (at 800 and 1600), fading in; a missing one leaves the dark band. */
export function Plate({ src, alt = "", className }: { src: string; alt?: string; className: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  const allowed = useMotionAllowed();
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0) setBroken(true);
  }, []);
  if (broken) return <div className={`${className} is-empty`} aria-hidden="true" />;
  return (
    <img
      ref={image}
      src={`${src}-1600.webp`}
      srcSet={`${src}-800.webp 800w, ${src}-1600.webp 1600w`}
      sizes="100vw"
      alt={alt}
      decoding="async"
      onError={() => setBroken(true)}
      className={`${className} ${allowed ? "motion-allowed" : ""}`}
    />
  );
}

export function Deck({ art, label, heading, kicker, title, titleId, description, aside, children, compact = false }: {
  /** Path under /media/art/ without the width suffix: "hot", "epochs/agents". */
  art?: string;
  /** The band's accessible name (the page's name). */
  label: string;
  /** The page's h1 when the title is display copy rather than the page's name (the front page's line). */
  heading?: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  /** An anchor on the title (a report's skip target). */
  titleId?: string;
  description?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  /** A slim band for reading pages and small pages. */
  compact?: boolean;
}) {
  return (
    <section className={`deck ${compact ? "is-compact" : ""}`} aria-label={label}>
      {art && <Plate key={art} src={`/media/art/${art}`} className="deck-plate" />}
      <div className="deck-shade" aria-hidden="true" />
      <div className="deck-inner">
        <div className="deck-row">
          <div className="deck-copy">
            {heading && <h1 className="deck-heading">{heading}</h1>}
            {kicker && <div className="deck-kicker">{kicker}</div>}
            {heading ? <p id={titleId} className="deck-title">{title}</p> : <h1 id={titleId} className="deck-title">{title}</h1>}
            {description && <div className="deck-desc">{description}</div>}
          </div>
          {aside && <div className="deck-aside">{aside}</div>}
        </div>
        {children && <div className="deck-foot">{children}</div>}
      </div>
    </section>
  );
}
