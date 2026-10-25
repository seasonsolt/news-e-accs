// How the observatory hands over to a scene (a module's page in an iframe over the plate, WebModule.chronicle)
// and takes it back. The scene loads paused behind the plate and says `ready`; the observatory sends `enter`
// once the reader steps in; the scene answers `entered` when its camera stands where the plate was drawn, and
// `exit` when the reader goes back. Both sides accept only same-origin messages from the other window.
export const TO_SCENE = "eacc-chronicle";
export const FROM_SCENE = "eacc-scene";

export type SceneCommand = "enter";
export type SceneEvent = "ready" | "entered" | "exit";

const COMMANDS: readonly string[] = ["enter"] satisfies SceneCommand[];
const EVENTS: readonly string[] = ["ready", "entered", "exit"] satisfies SceneEvent[];

/** The address of a scene page as the observatory embeds it. */
export function embedPath(path: string) {
  return `${path}?embed`;
}

function read(event: MessageEvent, source: MessageEventSource | null, origin: string, from: string, types: readonly string[]) {
  if (event.origin !== origin || !source || event.source !== source) return null;
  const data = event.data as { source?: unknown; type?: unknown } | null;
  return data?.source === from && typeof data.type === "string" && types.includes(data.type) ? data.type : null;
}

/** In the observatory: what the scene in `frame` said, or null for anything else. */
export function readSceneEvent(event: MessageEvent, frame: Window | null, origin: string): SceneEvent | null {
  return read(event, frame, origin, FROM_SCENE, EVENTS) as SceneEvent | null;
}

/** In the scene: what the observatory (`parent`) asked, or null for anything else. */
export function readSceneCommand(event: MessageEvent, parent: Window | null, origin: string): SceneCommand | null {
  return read(event, parent, origin, TO_SCENE, COMMANDS) as SceneCommand | null;
}
