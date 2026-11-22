// The shape of the walk, without three.js: where the road runs, how the ground rises, and what year each step stands for.
// `s` is the distance walked along the road; the world runs toward -z, so a point on the road is (roadX(s), -s).

export const START_S = 22, FIRE_S = 46, CAVE_S = 154, SOW_S = 250, FIELD_S = 258, MONO_S = 640, END_S = 635.5;
export const MONOLITH = { depth: 2.2, width: 8.8, height: 19.8, burial: .28, yaw: -.14 } as const;
/** Where the first village's yard begins, where the first machine (the windmill's tower) starts to rise, where the dishes and compute halls rise, and where the stone comes within reach. */
export const VILLAGE = { from: 316, to: 352, yardS: 334, yardOff: 16.5 } as const;
export const VILLAGE_S = VILLAGE.from, MACHINES_S = 438, COMPUTE_S = 574, REACH_S = MONO_S - 18.5;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const hash = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
export function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), ux), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
}
export const fbm = (x: number, y: number) => noise(x, y) * .55 + noise(x * 2.1, y * 2.1) * .3 + noise(x * 4.3, y * 4.3) * .15;
/** A fixed sequence in [0, 1): the same land for every visitor. */
export function sequence(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

/** Shared road curve coefficients (also read by groundcover.ts so shader ruts never drift from the road). */
export const ROAD = { a1: 13, f1: .0115, a2: 5, f2: .031, p2: 1.3 } as const;
export const roadX = (s: number) => ROAD.a1 * Math.sin(s * ROAD.f1) + ROAD.a2 * Math.sin(s * ROAD.f2 + ROAD.p2);
/** Ground height. The road itself stays gentle; ridges rise beside it in the night country, and the last field lies almost flat around the stone. */
export function ground(x: number, z: number) {
  const s = -z, d = Math.abs(x - roadX(s)), wild = 1 - smooth(150, 240, s), field = smooth(380, 480, s);
  const roll = (fbm(x * .018 + 9, z * .018) - .5) * 9 * smooth(5, 42, d) * (1 - field * .72);
  const ridge = Math.pow(fbm(x * .035, z * .035 + 4), 2) * 34 * smooth(20, 70, d) * wild;
  const near = (noise(x * .21, z * .21) - .5) * .5 * (1 - field * .6);
  return (roll + ridge + near) * mix(.12, 1, smooth(8, 46, Math.hypot(x - roadX(MONO_S), s - MONO_S)));
}

/** Where the wheat gives way to something else: [s, offset from the road, radius]. The pond's radius takes in its bank and the shaduf. */
export const CLEARINGS = { pond: [361, -9.5, 6.4], reaped: [425, -13.5, 8.5], calendar: [452, 10, 5.5], mill: [486, 34, 6], dish: [584, 15.5, 7.5], compute: [604, -17, 9.5] } as const;
/** Small scenes close enough to inspect on foot: [distance along the road, offset, bare ground radius]. */
export const ROADSIDE = {
  migration: [132, -4.1, 3.3], ledger: [352, 4.6, 3.1], press: [439, 5.1, 4.2],
  loom: [490, -4.9, 3.8], terminal: [551, 4.3, 3.1],
} as const;
export const roadsideStops = Object.values(ROADSIDE);
// The Chronicle uses astronomical years. Dates with day precision retain their fraction in a timeline link.
export const STOP_YEARS = { migration: -58050, ledger: -3199, press: 1440, loom: 1804, terminal: 1969.8247 } as const;
/** The canal: it leaves the pond, runs beside the road on the left from `from` to `to`, and lets channels into the wheat: [s where one leaves, s where it ends, offset where it ends]. */
export const CANAL = { from: 368, to: 444, offset: -5.2, channels: [[381, 385, -19], [402, 406.5, -23], [439, 443, -21]] } as const;
/** The plank bridge across the canal into the harvest clearing. */
export const BRIDGE = { s: 424, halfS: .62, bank: 1.18, deck: .32 } as const;
/** The places the walk's anonymous counts name, in order along the road (docs/analytics.md); the server accepts only these names. */
export const MILESTONES = [["fire", FIRE_S], ["cave", CAVE_S], ["sow", SOW_S], ["village", VILLAGE_S], ["fields", CANAL.from], ["machines", MACHINES_S], ["compute", COMPUTE_S], ["stone", REACH_S]] as const;
const toSegment = (x: number, s: number, ax: number, as: number, bx: number, bs: number) => {
  const dx = bx - ax, ds = bs - as, t = clamp(((x - ax) * dx + (s - as) * ds) / (dx * dx + ds * ds), 0, 1);
  return Math.hypot(x - ax - dx * t, s - as - ds * t);
};
/** How far a point lies from the canal's centre line, from the middle of the pond to its end. */
export function fromCanal(x: number, s: number) {
  const [ps, off] = CLEARINGS.pond, outlet = toSegment(x, s, roadX(ps) + off, ps, roadX(CANAL.from) + CANAL.offset, CANAL.from);
  return s >= CANAL.from && s <= CANAL.to ? Math.min(outlet, Math.abs(x - roadX(s) - CANAL.offset)) : outlet;
}
/** Keeps a walker on dry ground: out of the pond and the canal, while letting them cross the plank bridge at s = 424. */
export function keepDry(x: number, s: number): [x: number, s: number] {
  const [ps, off] = CLEARINGS.pond, px = roadX(ps) + off, pondR = 4.35, pd = Math.hypot(x - px, s - ps);
  if (pd < pondR) {
    if (pd > 1e-4) { x = px + (x - px) / pd * pondR; s = ps + (s - ps) / pd * pondR; }
    else x = px + pondR;
  }
  const bx = roadX(CANAL.from) + CANAL.offset, dx = bx - px, ds = CANAL.from - ps;
  const t = clamp(((x - px) * dx + (s - ps) * ds) / (dx * dx + ds * ds), 0, 1), ox = px + dx * t, os = ps + ds * t, od = Math.hypot(x - ox, s - os);
  if (od < BRIDGE.bank && s < CANAL.from + .2) {
    if (od > 1e-4) { x = ox + (x - ox) / od * BRIDGE.bank; s = os + (s - os) / od * BRIDGE.bank; }
    else x = ox + BRIDGE.bank;
  }
  if (s >= CANAL.from - .3 && s <= CANAL.to + .5) {
    const cx = roadX(s) + CANAL.offset, across = Math.abs(x - cx), along = Math.abs(s - BRIDGE.s);
    if (across < BRIDGE.bank && along > BRIDGE.halfS) {
      const toBank = BRIDGE.bank - across, toBridge = along - BRIDGE.halfS;
      if (toBridge < toBank) s = BRIDGE.s + (s > BRIDGE.s ? BRIDGE.halfS : -BRIDGE.halfS);
      else x = cx + (x >= cx ? BRIDGE.bank : -BRIDGE.bank);
    }
  }
  return [x, s];
}
/** How much higher the walker stands when crossing the plank bridge over the canal. */
export function bridgeLift(x: number, s: number) {
  const cx = roadX(s) + CANAL.offset;
  return (1 - smooth(BRIDGE.halfS, BRIDGE.halfS + .35, Math.abs(s - BRIDGE.s))) * (1 - smooth(1.35, 1.85, Math.abs(x - cx))) * BRIDGE.deck;
}
// Road coordinates of permanent clearings are shared by every stalk in the field.
const clearingDiscs = [...Object.values(CLEARINGS), ...roadsideStops].map(([s, off, radius]) => ({ x: roadX(s) + off, s, radius }));
const channels = CANAL.channels.map(([a, b, end]) => ({ a, b, ax: roadX(a) + CANAL.offset, bx: roadX(b) + end }));
/** Whether a point is bare of wheat: inside a clearing, beside the canal or along one of its channels. */
export function cleared(x: number, s: number) {
  for (const disc of clearingDiscs) {
    const ds = s - disc.s;
    if (Math.abs(ds) < disc.radius && (x - disc.x) ** 2 + ds ** 2 < disc.radius ** 2) return true;
  }
  if (s < CLEARINGS.pond[0] - 1.5 || s > CANAL.to + 1.5) return false;
  return fromCanal(x, s) < 1.5 ||
    channels.some(({ a, b, ax, bx }) => s > a - .8 && s < b + .8 && toSegment(x, s, ax, a, bx, b) < .8);
}

/** The sheet of ground as it is drawn: `across` by `along` cells over 300 m by 800 m, reaching from 50 m behind the start to 750 m ahead. */
export const LAND = { width: 300, depth: 800, behind: 50 };
/** Height of the drawn ground, which is flat within each triangle of the sheet; things stand on this, not on the smooth `ground`. */
export function sheet(across: number, along: number, vertexHeight: (index: number) => number) {
  const dx = LAND.width / across, dz = LAND.depth / along, x0 = -LAND.width / 2, z0 = LAND.behind - LAND.depth;
  return (x: number, z: number) => {
    const ix = clamp(Math.floor((x - x0) / dx), 0, across - 1), iz = clamp(Math.floor((z - z0) / dz), 0, along - 1), u = (x - x0) / dx - ix, v = (z - z0) / dz - iz;
    const first = iz * (across + 1) + ix, right = vertexHeight(first + 1), below = vertexHeight(first + across + 1);
    if (u + v <= 1) {
      const h = vertexHeight(first);
      return h + u * (right - h) + v * (below - h);
    }
    const h = vertexHeight(first + across + 2);
    return h + (1 - u) * (below - h) + (1 - v) * (right - h);
  };
}

// Keep the date steady while the walker approaches each small scene, then resume the logarithmic clock.
function stopDates(stop: keyof typeof ROADSIDE): Array<[number, number]> {
  const s = ROADSIDE[stop][0], age = 2026 - Math.floor(STOP_YEARS[stop]);
  return [[s - 12, age], [s + 1, age]];
}
const marks: ReadonlyArray<readonly [number, number]> = [
  [0, 1e6], [60, 1e6], ...stopDates("migration"), [CAVE_S, 40000], [SOW_S, 12000],
  ...stopDates("ledger"), ...stopDates("press"), [470, 300], ...stopDates("loom"), ...stopDates("terminal"), [600, 1],
];
/** Years before 2026 at a point on the road. */
export function yearsAgo(s: number) {
  if (s >= 600) return 0;
  let i = 0; while (i < marks.length - 2 && s > marks[i + 1]![0]) i++;
  const [s0, y0] = marks[i]!, [s1, y1] = marks[i + 1]!;
  return Math.pow(10, mix(Math.log10(y0), Math.log10(y1), clamp((s - s0) / (s1 - s0), 0, 1)));
}
const presentYear = new Date().getUTCFullYear();
/** The year as the instrument shows it: a figure and its unit, rounded more coarsely the further back it is. */
export function yearReading(s: number, locale: "zh" | "en"): [figure: string, unit: string] {
  const ago = yearsAgo(s), year = ago === 0 ? presentYear : 2026 - ago;
  if (ago >= 10000) {
    const digits = Math.pow(10, Math.floor(Math.log10(ago)) - 1), nearest = Math.round(ago / digits) * digits;
    return locale === "zh" ? [String(Number((nearest / 10000).toFixed(1))), "万年前"] : [nearest.toLocaleString("en-US"), "years ago"];
  }
  if (year < 0) { const n = String(Math.round(-year / 100) * 100); return locale === "zh" ? [`前 ${n}`, "年"] : [n, "BCE"]; }
  return [String(year < 1800 ? Math.round(year / 10) * 10 : Math.round(year)), locale === "zh" ? "年" : "CE"];
}
export const chapterAt = (s: number) => s < 200 ? "Ⅰ · 火" : s < 470 ? "Ⅱ · 田" : "Ⅲ · 碑";
/** What the walk says, and where along the road it says it. */
export const LINES: ReadonlyArray<readonly [number, string]> = [
  [2, "天黑以后，还有人往火里添柴。"],
  [ROADSIDE.migration[0] - 12, "有人背起行囊。孩子踩着前人的脚印，走出火光。"],
  [CAVE_S, "手早已离开石壁，后来的人还看得见掌印。"],
  [220, "篮子里的麦粒，有人留着明年再种。"],
  [310, "麦种被带到了新的土地。种麦的人却在田边住了下来。"],
  [ROADSIDE.ledger[0] - 12, "收进仓的谷物有多少？芦苇笔在湿泥上留下了账。"],
  [386, "人给麦田挖了水渠，也让自己的日子跟着收成走。"],
  [ROADSIDE.press[0] - 12, "纸从压板下揭起来。同一行字，又多了一个读者。"],
  [457, "风推着磨盘转。有人在这里把麦粒磨成面粉。"],
  [ROADSIDE.loom[0] - 12, "换一串孔卡，织出的花纹就变了。"],
  [510, "抬头看，电线沿着田埂，一直通到机房。"],
  [ROADSIDE.terminal[0] - 12, "有人想从远处登录。线路中断前，另一台计算机收到了 LO。"],
  [584, "风扇在响。机房里的模型，学的是人留下的文字和代码。"],
];
