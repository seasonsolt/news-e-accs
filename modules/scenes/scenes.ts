// Scenes entered from era and milestone plates. Code and copy live under web/; scanned textures
// live in R2 under scenes/<id>/ (assets/<id>/sources.json; README.md). Asset provenance and shared scan references are documented in the module README.
export interface Scene {
  /** Its folder under web/ and assets/, and its prefix under /media/scenes/. */
  id: string;
  /** The milestone (industry/chronicle/milestones.json) whose plate opens onto it. */
  milestone?: string;
  /** The era's plate. A scene can also be entered from its own illustrated milestone. */
  era?: string;
  /** Its page. */
  path: string;
  /** The way in from the plate, translated by the module's messages. */
  label: string;
}

export const SCENES: readonly Scene[] = [
  { id: "stone-tools", era: "homo-stone-tools", milestone: "lomekwi-tools", path: "/chronicle/stone-tools", label: "走进石器工坊" },
  { id: "taming-fire", era: "taming-fire", milestone: "control-of-fire", path: "/chronicle/fire", label: "走进火的工坊" },
  { id: "agriculture", era: "agricultural-revolution", milestone: "agriculture", path: "/chronicle/agriculture", label: "走进农业工坊" },
  { id: "difference-engine-1822", milestone: "difference-engine", path: "/chronicle/difference-engine", label: "走进工坊" },
  { id: "agents-2026", era: "agents", path: "/chronicle/agents", label: "走进智能体工坊" },
  { id: "writing", era: "cities-writing", milestone: "cuneiform", path: "/chronicle/writing", label: "走进泥板工坊" },
  { id: "iron", era: "iron-age", milestone: "iron-age", path: "/chronicle/iron", label: "走进冶铁工坊" },
  { id: "printing", era: "printing", milestone: "gutenberg-press", path: "/chronicle/printing", label: "走进印刷工坊" },
  { id: "observatory", era: "scientific-revolution", milestone: "sidereus-nuncius", path: "/chronicle/observatory", label: "走进天文工坊" },
  { id: "steam", era: "steam-age", milestone: "watt-engine", path: "/chronicle/steam", label: "走进蒸汽工坊" },
  { id: "electric", era: "electric-age", milestone: "light-bulb", path: "/chronicle/electric", label: "走进电气工坊" },
  { id: "flight", era: "combustion-flight", milestone: "wright-flyer", path: "/chronicle/flight", label: "走进航空工坊" },
  { id: "logic", era: "transistor-computer", milestone: "transistor", path: "/chronicle/logic", label: "走进逻辑工坊" },
  { id: "space", era: "space-age", milestone: "apollo-11", path: "/chronicle/space", label: "走进航天工坊" },
  { id: "network", era: "internet", milestone: "world-wide-web", path: "/chronicle/network", label: "走进网络工坊" },
];
