import { defineModule } from "@aihot/contracts/modules";
import { SCENES } from "./scenes.ts";

// Explorable scenes entered from the chronicle (加速史): one page per scene, opened inside the observatory.
export default defineModule({
  name: "scenes",
  pages: [
    { path: "chronicle/workshops", file: "web/gallery.tsx", id: "scene-gallery" },
    { path: "zh/chronicle/workshops", file: "web/gallery.tsx", id: "zh-scene-gallery" },
    ...SCENES.flatMap((scene) => [
    { path: scene.path.slice(1), file: `web/${scene.id}/page.tsx`, id: `scene-${scene.id}` },
    { path: `zh${scene.path}`, file: `web/${scene.id}/page.tsx`, id: `zh-scene-${scene.id}` },
  ])],
  localizedPaths: [/^\/chronicle\/workshops$/, ...SCENES.map((scene) => new RegExp(`^${scene.path}$`))],
});
