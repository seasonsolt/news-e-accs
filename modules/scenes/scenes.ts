// The scenes and the chronicle milestones they are entered from. A scene's pictures and textures are in R2
// under scenes/<id>/ (assets/<id>/sources.json; README.md), its code and copy in web/<id>/.
export interface Scene {
  /** Its folder under web/ and assets/, and its prefix under /media/scenes/. */
  id: string;
  /** The milestone (industry/chronicle/milestones.json) whose plate opens onto it. */
  milestone: string;
  /** Its page. */
  path: string;
  /** The way in from the plate, translated by web/<id>/messages.ts. */
  label: string;
}

export const SCENES: readonly Scene[] = [
  { id: "difference-engine-1822", milestone: "difference-engine", path: "/chronicle/difference-engine", label: "走进工坊" },
];
