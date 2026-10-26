import { WorldPage, worldMeta } from "../shared/page.tsx";
import { WORLDS } from "../shared/worlds.ts";
export { handle, links } from "../shared/page.tsx";
const world = WORLDS["observatory"];
export const meta = (args: Parameters<typeof worldMeta>[1]) => worldMeta(world, args);
export default function Page() { return <WorldPage world={world} />; }
