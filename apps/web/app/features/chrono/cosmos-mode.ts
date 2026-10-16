// Whether this browser should fly. The flat timeline is the page; 3D is an extra view.
// Mobile stays flat for this version. Reduced motion and a missing WebGL2 context cannot opt in.
// A low-end desktop or a data-saver connection stays flat until the reader chooses 3D.

export interface CosmosEnvironment {
  flag: boolean;
  desktop: boolean;
  webgl2: boolean;
  reducedMotion: boolean;
  lowEnd: boolean;
  saveData: boolean;
}

export interface CosmosDecision {
  /** The 2D/3D switch is shown. Phones keep the flat page and no switch. */
  toggle: boolean;
  /** 3D is allowed to run. */
  allowed: boolean;
  /** First visit enters 3D without a click. */
  defaultOn: boolean;
}

export function decideCosmos3d(env: CosmosEnvironment): CosmosDecision {
  const toggle = env.flag && env.desktop;
  const allowed = toggle && env.webgl2 && !env.reducedMotion;
  return { toggle, allowed, defaultOn: allowed && !env.lowEnd && !env.saveData };
}

export function readCosmosEnvironment(flag: boolean): CosmosEnvironment {
  const desktop = window.matchMedia("(min-width: 961px) and (hover: hover) and (pointer: fine)").matches;
  const reducedMotion = document.documentElement.getAttribute("data-motion") === "reduced"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memory = nav.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const lowEnd = (typeof memory === "number" && memory > 0 && memory < 4) || (cores > 0 && cores < 4);
  return { flag, desktop, webgl2: hasWebGL2(), reducedMotion, lowEnd, saveData: !!nav.connection?.saveData };
}

function hasWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
