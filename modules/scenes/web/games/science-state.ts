import type { GameController, GameSnapshot, GameTone } from "./types.ts";
import { drawDistinct, shuffle, type Random } from "./random.ts";

const pairs = (a: number, b: number) => Array.from({ length: a * b }, (_, i): readonly [number, number] => [Math.floor(i / b), i % b]);
const samePair = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1];

/** Every bearing (six) and focus (four) the telescope can be set to. The Moon, Jupiter and Venus each get a different one, and none is the starting setting. */
export function drawObservatoryTargets(random: Random) {
  return drawDistinct(pairs(6, 4), 3, [[0, 0]], random, samePair);
}

export function createObservatoryGame(random: Random = Math.random) {
  let targets!: ReturnType<typeof drawObservatoryTargets>, aim = 0, focus = 0, progress = 0, status = "", tone: GameTone = "info";
  const say = (text: string, next: GameTone = "info") => { status = text; tone = next; };
  const actions = [{ id: "primary", label: "观察目标" }, { id: "aim-left", label: "向左转动" }, { id: "aim-right", label: "向右转动" }, { id: "focus-in", label: "缩短焦距" }, { id: "focus-out", label: "延长焦距" }];
  const game = {
    actions,
    view: () => ({ aim, focus, progress, target: targets[Math.min(progress, 2)]!, targets }),
    snapshot(): GameSnapshot { return { progress, complete: progress === 3, status, tone, readings: [`${aim + 1} / 6`, `${focus + 1} / 4`, `${progress} / 3`], primary: "primary" }; },
    act(action: string) {
      if (progress === 3) return;
      if (action === "aim-left") aim = (aim + 5) % 6;
      else if (action === "aim-right") aim = (aim + 1) % 6;
      else if (action === "focus-in") focus = (focus + 3) % 4;
      else if (action === "focus-out") focus = (focus + 1) % 4;
      else if (action === "primary") {
        const target = targets[progress]!;
        if (aim !== target[0]) say("方向不符：对照星图的方位刻度，再试一次。", "error");
        else if (focus !== target[1]) say("目标仍然模糊：方向正确，再调整焦距。", "error");
        else { progress++; say(progress === 3 ? "三次观察已记录，可以比较天体的不同外观。" : "观察已记录，请按星图寻找下一个目标。", "progress"); }
        return;
      } else return;
      say("刻度已调整，点击观察检验选择。");
    },
    reset() { targets = drawObservatoryTargets(random); aim = focus = progress = 0; say("先查看星图，选择方向与焦距。"); },
    demo() { if (progress === 3) return; [aim, focus] = targets[progress]!; game.act("primary"); },
  };
  game.reset();
  return game satisfies GameController;
}

/** Valve and load settings whose pressure and speed stay on the dials and below the relief limit. Each reads differently, so a target names one setting. */
const STEAM_SETTINGS = pairs(5, 5).filter(([valve, load]) => {
  const pressure = valve * 2 - load, speed = valve * 3 - load * 2;
  return pressure >= 1 && pressure < 7 && speed >= 1 && speed <= 8;
});
export function drawSteamTargets(random: Random) { return drawDistinct(STEAM_SETTINGS, 3, [], random, samePair); }

/** Dimensionless teaching model; these values are not operating parameters for real machinery. */
export function createSteamGame(random: Random = Math.random) {
  let targets!: ReturnType<typeof drawSteamTargets>, valve = 0, load = 0, progress = 0, stable = 0, status = "", tone: GameTone = "info";
  const say = (text: string, next: GameTone = "info") => { status = text; tone = next; };
  const actions = [{ id: "primary", label: "测试稳定性" }, { id: "valve-down", label: "关小汽阀" }, { id: "valve-up", label: "开大汽阀" }, { id: "load-down", label: "减小负载" }, { id: "load-up", label: "增加负载" }, { id: "relief", label: "泄压复位" }];
  const game = {
    actions,
    view() { const target = targets[Math.min(progress, 2)]!; return { valve, load, progress, stable, pressure: Math.max(0, valve * 2 - load), speed: Math.max(0, valve * 3 - load * 2), targetPressure: target[0] * 2 - target[1], targetSpeed: target[0] * 3 - target[1] * 2 }; },
    snapshot(): GameSnapshot { const s = game.view(); return { progress, complete: progress === 3, status, tone, readings: [`${s.pressure} / ${s.targetPressure}`, `${s.speed} / ${s.targetSpeed}`, `${stable} / 2`], primary: "primary" }; },
    act(action: string) {
      if (progress === 3) return;
      if (action === "valve-down") valve = Math.max(0, valve - 1);
      else if (action === "valve-up") valve = Math.min(4, valve + 1);
      else if (action === "load-down") load = Math.max(0, load - 1);
      else if (action === "load-up") load = Math.min(4, load + 1);
      else if (action === "relief") { valve = stable = 0; say("压力已释放，保留已完成记录，可重新调节。"); return; }
      else if (action === "primary") {
        const s = game.view();
        if (s.pressure >= 7) { stable = 0; say("压力过高：先泄压，再降低汽阀开度。", "error"); }
        else if (s.pressure !== s.targetPressure || s.speed !== s.targetSpeed) { stable = 0; say("尚未平衡：比较指针与标记区，调整汽阀或负载。", "error"); }
        else {
          stable++;
          if (stable === 2) { progress++; if (progress < 3) stable = 0; say(progress === 3 ? "三个工况均已稳定，蒸汽与机械运动形成配合。" : "工况已稳定，下一组目标标记已更新。", "progress"); }
          else say("第一次采样稳定，再测试一次确认。", "progress");
        }
        return;
      } else return;
      stable = 0; say("设置已改变，测试指针是否同时进入标记区。");
    },
    reset() { targets = drawSteamTargets(random); valve = load = progress = stable = 0; say("调节汽阀与负载，让两根指针进入标记区。"); },
    demo() { if (progress === 3) return; [valve, load] = targets[progress]!; game.act("primary"); },
  };
  game.reset();
  return game satisfies GameController;
}

/** The three lamps in the order they are to be lit. */
export function drawLampOrder(random: Random) { return shuffle([1, 2, 3], random); }

export function createElectricGame(random: Random = Math.random) {
  let order!: number[], route = 0, closed = false, progress = 0, status = "", tone: GameTone = "info";
  const say = (text: string, next: GameTone = "info") => { status = text; tone = next; };
  const actions = [{ id: "primary", label: "测试回路" }, { id: "route-next", label: "切换接点" }, { id: "switch", label: "切换总开关" }];
  const game = {
    actions,
    /** `target` is the lamp (1–3) to light next; `lit` are the lamps already lit. */
    view: () => ({ route, closed, progress, order, target: order[Math.min(progress, 2)]!, lit: order.slice(0, progress) }),
    snapshot(): GameSnapshot { return { progress, complete: progress === 3, status, tone, readings: [`${route} / 3`, closed ? "闭合" : "断开", `${progress} / 3`], primary: "primary" }; },
    act(action: string) {
      if (progress === 3) return;
      if (action === "route-next") { route = (route + 1) % 4; say("接点已切换，沿铜线检查回路。"); }
      else if (action === "switch") { closed = !closed; say(closed ? "开关已合上，点击测试观察电流路径。" : "开关已断开，可以重新选择支路。"); }
      else if (action === "primary") {
        if (!closed) say("回路断开：先合上开关，再测试。", "error");
        else if (route === 0) { closed = false; say("短接支路没有经过灯丝，保护开关已断开，请重选接点。", "error"); }
        else if (route !== order[progress]) say("接点没有通向当前目标灯，请对照编号重选支路。", "error");
        else { progress++; say(progress === 3 ? "三支灯均已点亮，闭合路径让能量抵达灯丝。" : "灯丝已点亮，请切换到下一支灯的接点。", "progress"); }
      }
    },
    reset() { order = drawLampOrder(random); route = progress = 0; closed = false; say("选择灯支路，合上开关，再测试回路。"); },
    demo() { if (progress === 3) return; route = order[progress]!; closed = true; game.act("primary"); },
  };
  game.reset();
  return game satisfies GameController;
}
