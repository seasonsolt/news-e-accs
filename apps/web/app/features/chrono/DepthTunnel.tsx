// The observatory's tunnel on a desktop (depth-tunnel.ts): three.js and the plates' depth maps are fetched
// only where it runs, a wide window with a mouse and motion allowed. Elsewhere the observatory keeps its
// plate and DepthLayer. Nothing is drawn on the server; the <img> stays underneath until the first plate is in.
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useMotionAllowed } from "../motion/preferences";
import type { Tunnel, TunnelPicture } from "./depth-tunnel.ts";

const DESKTOP = "(min-width: 961px) and (hover: hover) and (pointer: fine)";

function subscribeDesktop(listener: () => void) {
  const media = window.matchMedia(DESKTOP);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** Whether the tunnel runs here: false on the server and in the hydration render. */
export function useTunnelAllowed(): boolean {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  return useMotionAllowed() && desktop;
}

export interface TunnelState {
  /** The tunnel is set to draw the plate here (it may still be loading). */
  running: boolean;
  /** The canvas is drawing the plate the axis rests on. */
  ready: boolean;
}

/**
 * Runs the tunnel in `stage` while `allowed`. `pictures` must keep its identity while its content does
 * (the tunnel is rebuilt when it changes); `progress` and `alt` follow the axis.
 */
export function useDepthTunnel(stage: RefObject<HTMLElement | null>, { allowed, pictures, progress, alt }: { allowed: boolean; pictures: TunnelPicture[]; progress: number; alt: string }): TunnelState {
  const tunnel = useRef<Tunnel | null>(null);
  const [, refresh] = useState(0);
  const [failed, setFailed] = useState(false);
  const position = useRef({ progress, alt });
  position.current = { progress, alt };

  useEffect(() => {
    const element = stage.current;
    if (!allowed || failed || !element) return;
    let cancelled = false;
    void import("./depth-tunnel.ts").then(({ createTunnel }) => {
      if (cancelled) return;
      const created = createTunnel(element, pictures, () => refresh((n) => n + 1));
      if (!created) { setFailed(true); return; }
      tunnel.current = created;
      created.setProgress(position.current.progress, position.current.alt);
      refresh((n) => n + 1);
    }, () => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      tunnel.current?.dispose();
      tunnel.current = null;
    };
  }, [allowed, failed, pictures, stage]);

  useEffect(() => { tunnel.current?.setProgress(progress, alt); }, [progress, alt]);

  const current = tunnel.current;
  return {
    running: allowed && !failed,
    ready: !!current?.ready,
  };
}
