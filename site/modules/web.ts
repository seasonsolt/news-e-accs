import wallpaper from "@aihot/wallpaper/web";
// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import leaderboard from "@aihot/leaderboard/web";
import indices from "@aihot/indices/web";
import storyDepth from "@aihot/story-depth/web";
import scenes from "@aihot/scenes/web";
import essays from "@aihot/essays/web";

export const WEB_MODULES: readonly WebModule[] = [leaderboard, indices, essays, storyDepth, wallpaper, scenes];
