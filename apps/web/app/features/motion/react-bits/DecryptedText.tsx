// Adapted from React Bits DecryptedText (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// Telegraph decoding on deliberate fine-pointer hover only, never at load. One real text node
// supplies the accessible name; decorative pseudo-elements reserve one fixed-width cell per
// original character (including wide Chinese glyphs). A finite timer is cleared on leave and unmount.
import { useEffect, useRef, useState } from "react";
import { hasFinePointer, useMotionAllowed } from "../preferences";

export function DecryptedText({ text }: { text: string }) {
  const allowed = useMotionAllowed();
  const [display, setDisplay] = useState(text);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setDisplay(text);
  }
  useEffect(() => { stop(); return () => { if (timer.current) clearInterval(timer.current); }; }, [allowed, text]);
  function decode() {
    if (!allowed || timer.current) return;
    let tick = 0;
    const chars = "0123456789.-/";
    timer.current = setInterval(() => {
      tick++;
      if (tick >= 16) return stop();
      setDisplay(Array.from(text, (char, i) => i < text.length * tick / 16 || /\s/.test(char)
        ? char : chars[Math.floor(Math.random() * chars.length)]).join(""));
    }, 50);
  }
  return (
    <span className="relative inline-block"
      onPointerEnter={() => { if (hasFinePointer()) decode(); }} onPointerLeave={stop}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex whitespace-pre">
        {Array.from(text, (char, i) => <span key={i} data-text={char} data-display={allowed ? Array.from(display)[i] : char}
          className="relative inline-block before:invisible before:content-[attr(data-text)] after:absolute after:inset-0 after:text-center after:content-[attr(data-display)]" />)}
      </span>
    </span>
  );
}
