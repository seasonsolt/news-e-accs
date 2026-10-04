// The automaton keeps its final SSR image and existing theme treatment. Only an engraving proven
// below the fold at first paint prints on its first reveal; above-fold art is never hidden/rewound.
// No extra picture layer, duplicate text, focus target or persistent animation is introduced.
import { useRef } from "react";
import { useHalftoneReveal } from "../motion/reading-flow";

export function EmptyArt({ className = "", lazy = true }: { className?: string; lazy?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  useHalftoneReveal(ref);
  return <img ref={ref} src="/media/art/empty-800.webp" alt="" aria-hidden="true" loading={lazy ? "lazy" : undefined} decoding="async" className={`empty-art ${className}`} />;
}
