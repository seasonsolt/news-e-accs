/** The drawing port is structural so display-language tests do not require a browser or DOM globals. */
export interface ScreenContext {
  fillStyle: unknown; strokeStyle: unknown; font: string; lineWidth: number;
  fillText(value: string, x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void; arc(x: number, y: number, radius: number, start: number, end: number): void; fill(): void;
}

const C = { bg: "#0b1015", panel: "#101922", line: "#26343c", ink: "#dce3de", dim: "#83988e", mint: "#89d6b7", gold: "#ddba7a", cyan: "#8abfd2" };

function text(c: ScreenContext, value: string, x: number, y: number, size = 22, color = C.ink) {
  c.fillStyle = color; c.font = `${size}px monospace`; c.fillText(value, x, y);
}
function panel(c: ScreenContext, x: number, y: number, w: number, h: number) {
  c.fillStyle = C.panel; c.fillRect(x, y, w, h);
  c.strokeStyle = C.line; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
}
function line(c: ScreenContext, x: number, y: number, w: number, color = C.line) {
  c.fillStyle = color; c.fillRect(x, y, w, 1);
}

/** Display content is deliberately English in both reader editions. It is a local, deterministic workflow. */
export function drawWorkspace(c: ScreenContext, phase: number, time = 0) {
  const stage = Math.min(3, Math.max(0, Math.round(phase)));
  const tick = Math.floor(Math.max(0, Number.isFinite(time) ? time : 0) * 2);
  c.fillStyle = C.bg; c.fillRect(0, 0, 2400, 720);
  c.fillStyle = "#18232b"; c.fillRect(0, 0, 2400, 70);
  text(c, "WORKBENCH", 35, 46, 34); text(c, "/ agent workspace", 255, 44, 23, C.dim);
  text(c, "LOCAL  /  2026", 2070, 44, 22, C.gold);
  for (let i = 0; i < 3; i++) { c.fillStyle = i === stage - 1 ? C.mint : "#40504f"; c.beginPath(); c.arc(1960 + i * 23, 35, 5, 0, Math.PI * 2); c.fill(); }
  panel(c, 20, 88, 560, 570); panel(c, 596, 88, 1110, 570); panel(c, 1722, 88, 658, 570);
  const heading = (label: string, x: number, step: number, w: number) => {
    text(c, label, x + 24, 132, 26, stage >= step ? C.gold : C.dim);
    line(c, x + 20, 150, w - 40, stage === step ? C.gold : C.line);
  };
  heading("01  PLAN", 20, 1, 560); heading("02  BUILD", 596, 2, 1110); heading("03  VERIFY", 1722, 3, 658);
  text(c, "brief.md", 46, 195, 22, C.cyan);
  text(c, "Ship a reviewable artifact", 46, 239, 25);
  const tasks = ["Define the outcome", "Map the constraints", "Build the smallest slice", "Inspect before delivery"];
  tasks.forEach((label, i) => {
    const y = 304 + i * 65;
    c.strokeStyle = stage >= 1 ? C.mint : C.dim; c.strokeRect(48, y - 19, 19, 19);
    if (stage >= 1) text(c, "x", 51, y - 1, 19, C.mint);
    text(c, label, 85, y, 22, stage >= 1 ? C.ink : C.dim);
  });
  text(c, "BRANCH", 46, 615, 16, C.dim); text(c, "workspace / prototype", 140, 615, 18, C.gold);
  c.fillStyle = "#19252e"; c.fillRect(616, 166, 1070, 48);
  text(c, "result.ts", 640, 198, 22, C.ink); text(c, "M", 824, 198, 20, stage >= 2 ? C.gold : C.dim);
  const code: Array<[string, string]> = [
    ["import { plan, build, verify } from './agents';", C.dim], ["", C.ink],
    ["export async function run(brief: Brief) {", C.cyan],
    ["  const intent = await plan(brief);", C.ink],
    ["  const draft = await build(intent);", C.ink],
    ["  const report = await verify(draft);", C.ink], ["", C.ink],
    ["  if (!report.ok) {", C.gold],
    ["    return revise(draft, report);", C.ink],
    ["  }", C.gold], ["", C.ink],
    ["  return { artifact: draft, checks: report };", C.mint],
    ["}", C.cyan],
  ];
  const editingLines = [3, 4, 5, 7, 8, 11];
  const activeLine = stage === 2 ? editingLines[Math.floor(tick / 2) % editingLines.length]! : stage >= 2 ? 11 : 3;
  code.forEach(([value, color], i) => {
    const y = 252 + i * 26;
    if (i === activeLine) { c.fillStyle = "#20302e"; c.fillRect(623, y - 20, 1056, 27); }
    text(c, String(i + 1).padStart(2, "0"), 637, y, 18, "#52676a");
    text(c, value, 694, y, 21, stage >= 2 ? color : C.dim);
    if (stage === 2 && i === activeLine && tick % 2 === 0) { c.fillStyle = C.mint; c.fillRect(694 + value.length * 12.6, y - 17, 2, 21); }
  });
  text(c, stage === 2 ? "UTF-8   TypeScript   editing / local playback" : "UTF-8   TypeScript   main", 640, 630, 17, C.dim);
  const checks = ["Structure", "Interaction", "Artifact"];
  checks.forEach((value, i) => {
    const y = 210 + i * 104;
    panel(c, 1744, y - 35, 614, 82);
    text(c, value, 1770, y, 25);
    text(c, stage === 3 ? "PASS" : "PENDING", 2190, y, 21, stage === 3 ? C.mint : C.dim);
    text(c, ["schema + boundaries", "behavior + recovery", "output + evidence"][i]!, 1770, y + 28, 16, C.dim);
  });
  text(c, stage === 3 ? "READY FOR REVIEW" : "AWAITING VERIFICATION", 1764, 566, 24, stage === 3 ? C.mint : C.gold);
  text(c, `${stage} / 3 stages complete`, 1764, 610, 20, C.dim);
  c.fillStyle = "#1c302c"; c.fillRect(0, 676, 2400, 44);
  text(c, "workspace  /  local session", 28, 705, 18, C.mint);
  text(c, ["IDLE", "PLANNING", "BUILDING", "VERIFIED"][stage]!, 2080, 705, 20, C.gold);
}

export function drawTerminal(c: ScreenContext, phase: number, time = 0) {
  const stage = Math.min(3, Math.max(0, Math.round(phase)));
  const tick = Math.floor(Math.max(0, Number.isFinite(time) ? time : 0) * 2);
  c.fillStyle = "#0a1014"; c.fillRect(0, 0, 768, 1280);
  c.fillStyle = "#1b272a"; c.fillRect(0, 0, 768, 72);
  text(c, "~ / workspace", 30, 47, 30, C.mint); text(c, "01", 676, 47, 24, C.dim);
  const rows: Array<[string, string]> = [
    ["$ workbench attach --local", C.ink], ["session: prototype-2026", C.dim], ["mode: local playback", C.dim], ["", C.dim],
    ["[plan]  receive brief", stage >= 1 ? C.mint : C.dim], ["[plan]  resolve constraints", stage >= 1 ? C.mint : C.dim],
    ["[plan]  write intent.json", stage >= 1 ? C.gold : C.dim], ["", C.dim],
    ["[build] open workspace", stage >= 2 ? C.mint : C.dim], ["[build] apply change set", stage >= 2 ? C.mint : C.dim],
    ["[build] emit artifact", stage >= 2 ? C.gold : C.dim], ["", C.dim],
    ["[check] inspect structure", stage >= 3 ? C.mint : C.dim], ["[check] replay interactions", stage >= 3 ? C.mint : C.dim],
    ["[check] collect evidence", stage >= 3 ? C.gold : C.dim], ["", C.dim],
    [stage === 3 ? "3 checks passed." : stage === 2 ? "Editing result.ts..." : "Waiting for next stage...", stage === 3 ? C.mint : C.dim],
    [stage === 3 ? "artifact: ready for review" : "artifact: pending", C.ink],
  ];
  rows.forEach(([value, color], i) => {
    if (stage === 2 && i === 8 + Math.floor(tick / 2) % 3) { c.fillStyle = "#172a29"; c.fillRect(20, 101 + i * 44, 728, 43); }
    text(c, value, 30, 132 + i * 44, 25, color);
  });
  line(c, 30, 995, 708); text(c, "AGENT GRAPH", 30, 1042, 23, C.gold);
  const labels = ["PLAN", "BUILD", "VERIFY"];
  labels.forEach((label, i) => {
    c.strokeStyle = stage >= i + 1 ? C.mint : C.line; c.strokeRect(30 + i * 241, 1080, 220, 75);
    text(c, label, 60 + i * 241, 1127, 22, stage >= i + 1 ? C.mint : C.dim);
  });
  text(c, "$", 30, 1220, 28, C.mint);
  if (stage !== 2 || tick % 2 === 0) { c.fillStyle = C.gold; c.fillRect(67, 1200, 14, 27); }
}

export function drawHardware(c: ScreenContext, phase: number) {
  const stage = Math.min(3, Math.max(0, Math.round(phase)));
  c.fillStyle = "#091014"; c.fillRect(0, 0, 960, 480);
  text(c, "NODE / 01", 30, 62, 40); text(c, "CLOSED LOOP", 605, 58, 26, C.gold);
  line(c, 30, 90, 900);
  for (let i = 0; i < 3; i++) {
    const x = 30 + i * 310;
    text(c, ["COMPUTE", "MEMORY", "COOLING"][i]!, x, 150, 23, C.dim);
    text(c, ["LOCAL", `${stage} / 3`, "FLOW OK"][i]!, x, 217, 34, C.mint);
    for (let j = 0; j < 12; j++) { c.fillStyle = j < 3 + stage * 2 ? C.mint : "#213133"; c.fillRect(x + j * 22, 253, 14, 32); }
  }
  text(c, "SESSION", 30, 355, 24, C.dim);
  text(c, ["STANDBY", "PLANNING", "BUILDING", "VERIFIED"][stage]!, 225, 355, 34, C.gold);
  text(c, "LOCAL PLAYBACK / WORKBENCH 2026", 30, 442, 20, C.dim);
}
