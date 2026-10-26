import type { GameController, GameSnapshot } from "./types.ts";

export function createObservatoryGame() {
  const targets = [[1, 1], [3, 2], [5, 3]] as const;
  let aim = 0, focus = 0, progress = 0, status = "先查看星图，选择方向与焦距。";
  const actions = [{ id: "primary", label: "观察目标" }, { id: "aim-left", label: "向左转动" }, { id: "aim-right", label: "向右转动" }, { id: "focus-in", label: "缩短焦距" }, { id: "focus-out", label: "延长焦距" }];
  const game = {
    actions,
    view: () => ({ aim, focus, progress, target: targets[Math.min(progress, 2)]! }),
    snapshot(): GameSnapshot { return { progress, complete: progress === 3, status, readings: [`${aim + 1} / 6`, `${focus + 1} / 4`, `${progress} / 3`], primary: "primary" }; },
    act(action: string) {
      if (progress === 3) return;
      if (action === "aim-left") aim = (aim + 5) % 6;
      else if (action === "aim-right") aim = (aim + 1) % 6;
      else if (action === "focus-in") focus = (focus + 3) % 4;
      else if (action === "focus-out") focus = (focus + 1) % 4;
      else if (action === "primary") {
        const target = targets[progress]!;
        if (aim !== target[0]) status = "方向不符：对照星图的方位刻度，再试一次。";
        else if (focus !== target[1]) status = "目标仍然模糊：方向正确，再调整焦距。";
        else { progress++; status = progress === 3 ? "三次观察已记录，可以比较天体的不同外观。" : "观察已记录，请按星图寻找下一个目标。"; }
        return;
      } else return;
      status = "刻度已调整，点击观察检验选择。";
    },
    reset() { aim = focus = progress = 0; status = "先查看星图，选择方向与焦距。"; },
    demo() { if (progress === 3) return; [aim, focus] = targets[progress]!; game.act("primary"); },
  };
  return game satisfies GameController;
}

/** Dimensionless teaching model; these values are not operating parameters for real machinery. */
export function createSteamGame() {
  const targets = [[2, 1], [3, 2], [2, 2]] as const;
  let valve = 0, load = 0, progress = 0, stable = 0, status = "调节汽阀与负载，让两根指针进入标记区。";
  const actions = [{ id: "primary", label: "测试稳定性" }, { id: "valve-down", label: "关小汽阀" }, { id: "valve-up", label: "开大汽阀" }, { id: "load-down", label: "减小负载" }, { id: "load-up", label: "增加负载" }, { id: "relief", label: "泄压复位" }];
  const game = {
    actions,
    view() { const target = targets[Math.min(progress, 2)]!; return { valve, load, progress, stable, pressure: Math.max(0, valve * 2 - load), speed: Math.max(0, valve * 3 - load * 2), targetPressure: target[0] * 2 - target[1], targetSpeed: target[0] * 3 - target[1] * 2 }; },
    snapshot(): GameSnapshot { const s = game.view(); return { progress, complete: progress === 3, status, readings: [`${s.pressure} / ${s.targetPressure}`, `${s.speed} / ${s.targetSpeed}`, `${stable} / 2`], primary: "primary" }; },
    act(action: string) {
      if (progress === 3) return;
      if (action === "valve-down") valve = Math.max(0, valve - 1);
      else if (action === "valve-up") valve = Math.min(4, valve + 1);
      else if (action === "load-down") load = Math.max(0, load - 1);
      else if (action === "load-up") load = Math.min(4, load + 1);
      else if (action === "relief") { valve = stable = 0; status = "压力已释放，保留已完成记录，可重新调节。"; return; }
      else if (action === "primary") {
        const s = game.view();
        if (s.pressure >= 7) { stable = 0; status = "压力过高：先泄压，再降低汽阀开度。"; }
        else if (s.pressure !== s.targetPressure || s.speed !== s.targetSpeed) { stable = 0; status = "尚未平衡：比较指针与标记区，调整汽阀或负载。"; }
        else {
          stable++;
          if (stable === 2) { progress++; if (progress < 3) stable = 0; status = progress === 3 ? "三个工况均已稳定，蒸汽与机械运动形成配合。" : "工况已稳定，下一组目标标记已更新。"; }
          else status = "第一次采样稳定，再测试一次确认。";
        }
        return;
      } else return;
      stable = 0; status = "设置已改变，测试指针是否同时进入标记区。";
    },
    reset() { valve = load = progress = stable = 0; status = "调节汽阀与负载，让两根指针进入标记区。"; },
    demo() { if (progress === 3) return; [valve, load] = targets[progress]!; game.act("primary"); },
  };
  return game satisfies GameController;
}

export function createElectricGame() {
  let route = 0, closed = false, progress = 0, status = "选择灯支路，合上开关，再测试回路。";
  const actions = [{ id: "primary", label: "测试回路" }, { id: "route-next", label: "切换接点" }, { id: "switch", label: "切换总开关" }];
  const game = {
    actions,
    view: () => ({ route, closed, progress }),
    snapshot(): GameSnapshot { return { progress, complete: progress === 3, status, readings: [`${route} / 3`, closed ? "闭合" : "断开", `${progress} / 3`], primary: "primary" }; },
    act(action: string) {
      if (progress === 3) return;
      if (action === "route-next") { route = (route + 1) % 4; status = "接点已切换，沿铜线检查回路。"; }
      else if (action === "switch") { closed = !closed; status = closed ? "开关已合上，点击测试观察电流路径。" : "开关已断开，可以重新选择支路。"; }
      else if (action === "primary") {
        if (!closed) status = "回路断开：先合上开关，再测试。";
        else if (route === 0) { closed = false; status = "短接支路没有经过灯丝，保护开关已断开，请重选接点。"; }
        else if (route !== progress + 1) status = "接点没有通向当前目标灯，请对照编号重选支路。";
        else { progress++; status = progress === 3 ? "三支灯均已点亮，闭合路径让能量抵达灯丝。" : "灯丝已点亮，请切换到下一支灯的接点。"; }
      }
    },
    reset() { route = progress = 0; closed = false; status = "选择灯支路，合上开关，再测试回路。"; },
    demo() { if (progress === 3) return; route = progress + 1; closed = true; game.act("primary"); },
  };
  return game satisfies GameController;
}
