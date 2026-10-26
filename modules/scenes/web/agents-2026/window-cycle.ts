export interface WindowBlend {
  from: number;
  to: number;
  mix: number;
}

/** Blend indices select one shared panorama across all windows. Time is supplied by the scene clock. */
export class WindowCycle {
  readonly count: number;
  private initialized = false;
  private stage = 0;
  private offset = 0;
  private pending = 0;
  private nextAutomatic = Infinity;
  private transition: { from: number; to: number; started: number } | null = null;
  private readonly period = 10;
  private readonly duration = 1.4;

  constructor(count = 3) {
    if (!Number.isInteger(count) || count < 1) throw new RangeError("Window count must be a positive integer");
    this.count = count;
  }

  sample(stage: number, time: number, animate: boolean): WindowBlend {
    stage = Math.max(0, Math.round(stage));
    if (!this.initialized) {
      this.initialized = true;
      this.stage = stage;
      this.nextAutomatic = stage > 0 ? time + this.period : Infinity;
      return this.stable();
    }
    if (stage === 0) {
      this.stage = this.offset = this.pending = 0;
      this.transition = null;
      this.nextAutomatic = Infinity;
      return this.stable();
    }

    if (stage > this.stage) {
      this.pending = Math.min(3, this.pending + 1);
      this.nextAutomatic = time + this.period;
    }
    this.stage = stage;

    // A reduced-motion render completes requested changes immediately, without running a timer.
    if (!animate) {
      if (this.transition) this.offset = this.transition.to;
      this.offset = (this.offset + this.pending) % this.count;
      this.transition = null;
      this.pending = 0;
      this.nextAutomatic = time + this.period;
      return this.stable();
    }

    if (this.transition) {
      const { from, to, started } = this.transition;
      const progress = Math.min(1, Math.max(0, (time - started) / this.duration));
      if (progress === 1) {
        this.offset = to;
        this.transition = null;
        // Do not catch up a suspended clock with a burst of automatic rotations.
        if (this.nextAutomatic <= time) this.nextAutomatic = time + this.period;
      }
      // Expose a completed blend before starting the next queued change on a later sample.
      return { from, to, mix: progress * progress * (3 - 2 * progress) };
    }

    if (this.pending > 0 || time >= this.nextAutomatic) {
      if (this.pending > 0) this.pending--;
      this.transition = { from: this.offset, to: (this.offset + 1) % this.count, started: time };
      this.nextAutomatic = time + this.period;
      return { from: this.transition.from, to: this.transition.to, mix: 0 };
    }
    return this.stable();
  }

  private stable(): WindowBlend {
    return { from: this.offset, to: this.offset, mix: 1 };
  }
}
