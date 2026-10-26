import type { GameController, GameSnapshot } from "./types.ts";

const clamp = (n: number) => Math.max(-2, Math.min(2, n));

export class FlightGame implements GameController {
  cg = -1; elevator = 0; passed = 0; attempts = 0; status = "先调整重心与升降舵，再试飞。";
  readonly targets = [[0, 1], [1, 0], [-1, -1]] as const;
  readonly actions = [{ id: "primary", label: "试飞" }, { id: "cg-left", label: "重心后移" }, { id: "cg-right", label: "重心前移" }, { id: "elevator-up", label: "抬升舵面" }, { id: "elevator-down", label: "压低舵面" }];
  snapshot(): GameSnapshot { return { progress: this.passed, complete: this.passed === 3, status: this.status, readings: [`CG ${this.cg} / E ${this.elevator}`, `${this.passed} / 3`, `${this.attempts}`], primary: "primary" }; }
  act(action: string) {
    if (this.passed === 3) return;
    if (action === "cg-left") this.cg = clamp(this.cg - 1);
    else if (action === "cg-right") this.cg = clamp(this.cg + 1);
    else if (action === "elevator-up") this.elevator = clamp(this.elevator + 1);
    else if (action === "elevator-down") this.elevator = clamp(this.elevator - 1);
    else if (action === "primary") {
      this.attempts++;
      const [cg, elevator] = this.targets[this.passed]!;
      if (this.cg !== cg) this.status = "重心不在目标刻度，先移动配重。";
      else if (this.elevator !== elevator) this.status = this.elevator < elevator ? "机头偏低，增加升降舵。" : "机头偏高，减小升降舵。";
      else { this.passed++; this.status = this.passed === 3 ? "三段试飞完成，配平检验通过。" : "本段通过，请按下一张配平卡调整。"; }
    }
  }
  reset() { this.cg = -1; this.elevator = this.passed = this.attempts = 0; this.status = "先调整重心与升降舵，再试飞。"; }
  demo() {
    if (this.passed === 3) return;
    const [cg, elevator] = this.targets[this.passed]!;
    this.act(this.cg !== cg ? this.cg < cg ? "cg-right" : "cg-left" : this.elevator !== elevator ? this.elevator < elevator ? "elevator-up" : "elevator-down" : "primary");
  }
}

export class LogicGame implements GameController {
  a = 0; b = 0; output = 1; passed = 0; status = "设置两个输入与预测输出，检验真值表。";
  readonly actions = [{ id: "primary", label: "检验电路" }, { id: "input-a", label: "切换输入 A" }, { id: "input-b", label: "切换输入 B" }, { id: "output", label: "切换预测输出" }];
  snapshot(): GameSnapshot { return { progress: this.passed === 4 ? 3 : Math.min(2, this.passed), complete: this.passed === 4, status: this.status, readings: [`A${this.a} B${this.b} O${this.output}`, `${this.passed} / 4`, this.passed < 4 ? `TARGET ${Math.floor(this.passed / 2)}${this.passed % 2}` : "AND VERIFIED"], primary: "primary" }; }
  act(action: string) {
    if (this.passed === 4) return;
    if (action === "input-a") this.a ^= 1;
    else if (action === "input-b") this.b ^= 1;
    else if (action === "output") this.output ^= 1;
    else if (action === "primary") {
      if (this.a !== Math.floor(this.passed / 2) || this.b !== this.passed % 2) this.status = "输入与当前测试行不符，请对照测试卡。";
      else if (this.output !== (this.a & this.b)) this.status = "输出预测错误：只有两个输入都为一，AND 才输出一。";
      else { this.passed++; this.status = this.passed === 4 ? "四行真值表检验通过。" : "本行正确，继续设置下一组输入。"; }
    }
  }
  reset() { this.a = this.b = this.passed = 0; this.output = 1; this.status = "设置两个输入与预测输出，检验真值表。"; }
  demo() {
    if (this.passed === 4) return;
    const a = Math.floor(this.passed / 2), b = this.passed % 2;
    this.act(this.a !== a ? "input-a" : this.b !== b ? "input-b" : this.output !== (a & b) ? "output" : "primary");
  }
}

export class SpaceGame implements GameController {
  x = 2; y = -1; yaw = 1; passed = 0; status = "先对正位置与姿态，再推进接近。";
  readonly actions = [{ id: "primary", label: "推进或对接" }, { id: "left", label: "向左平移" }, { id: "right", label: "向右平移" }, { id: "up", label: "升高舱体" }, { id: "down", label: "降低舱体" }, { id: "yaw-left", label: "向左偏航" }, { id: "yaw-right", label: "向右偏航" }];
  snapshot(): GameSnapshot { return { progress: this.passed, complete: this.passed === 3, status: this.status, readings: [`X${this.x} Y${this.y} R${this.yaw}`, `${3 - this.passed}`, `${this.passed} / 3`], primary: "primary" }; }
  act(action: string) {
    if (this.passed === 3) return;
    if (action === "left") this.x = clamp(this.x - 1);
    else if (action === "right") this.x = clamp(this.x + 1);
    else if (action === "up") this.y = clamp(this.y + 1);
    else if (action === "down") this.y = clamp(this.y - 1);
    else if (action === "yaw-left") this.yaw = clamp(this.yaw - 1);
    else if (action === "yaw-right") this.yaw = clamp(this.yaw + 1);
    else if (action === "primary") {
      if (this.x || this.y) this.status = "位置未对正，先把横向与高度归零。";
      else if (this.yaw) this.status = "姿态未对正，调整偏航使对接环平行。";
      else {
        this.passed++;
        if (this.passed === 1) { this.y = 1; this.yaw = -1; }
        if (this.passed === 2) { this.x = -1; this.y = -1; this.yaw = 1; }
        this.status = this.passed === 3 ? "软对接完成，三个接近检查点通过。" : "接近通过，微小扰动后请重新对正。";
      }
    }
  }
  reset() { this.x = 2; this.y = -1; this.yaw = 1; this.passed = 0; this.status = "先对正位置与姿态，再推进接近。"; }
  demo() { if (this.passed < 3) this.act(this.x ? this.x > 0 ? "left" : "right" : this.y ? this.y > 0 ? "down" : "up" : this.yaw ? this.yaw > 0 ? "yaw-left" : "yaw-right" : "primary"); }
}

export class NetworkGame implements GameController {
  shard = 1; route = 1; passed = 0; status = "选择分片与可用路径，再发送。";
  readonly routes = [[true, false, true], [false, true, true], [true, true, false]] as const;
  readonly actions = [{ id: "primary", label: "发送并重组" }, { id: "shard", label: "选择下一分片" }, { id: "route", label: "切换传输路径" }];
  snapshot(): GameSnapshot { return { progress: this.passed, complete: this.passed === 3, status: this.status, readings: [`PART ${this.shard}`, `ROUTE ${this.route + 1}`, `${this.passed} / 3`], primary: "primary" }; }
  act(action: string) {
    if (this.passed === 3) return;
    if (action === "shard") this.shard = this.shard % 3 + 1;
    else if (action === "route") this.route = (this.route + 1) % 3;
    else if (action === "primary") {
      if (this.shard !== this.passed + 1) this.status = "分片顺序错误，接收端仍在等待下一片。";
      else if (!this.routes[this.shard - 1]![this.route]) this.status = "当前路径断开，请选择另一条线路。";
      else { this.passed++; this.status = this.passed === 3 ? "三个分片按序重组，消息完整送达。" : "分片已收到，请选择下一片与路径。"; }
    }
  }
  reset() { this.shard = 1; this.route = 1; this.passed = 0; this.status = "选择分片与可用路径，再发送。"; }
  demo() {
    if (this.passed === 3) return;
    this.act(this.shard !== this.passed + 1 ? "shard" : !this.routes[this.shard - 1]![this.route] ? "route" : "primary");
  }
}
