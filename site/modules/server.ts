import wallpaper from "@aihot/wallpaper/server";
// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import leaderboard from "@aihot/leaderboard/server";
import indices from "@aihot/indices/server";
import storyDepth from "@aihot/story-depth/server";
import essays from "@aihot/essays/server";
import scenes from "@aihot/scenes/server";

export const SERVER_MODULES: readonly ServerModule[] = [leaderboard, indices, essays, storyDepth, wallpaper, scenes];
