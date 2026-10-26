export type GameId = "writing" | "iron" | "printing" | "observatory" | "steam" | "electric" | "flight" | "logic" | "space" | "network";
export interface GameSnapshot {
  /** Four explanation/achievement stages, 0 through 3. Completion must be earned by play. */
  progress: number;
  complete: boolean;
  status: string;
  readings: [string, string, string];
  /** Submit/operate action. It must not automatically solve choices for the player. */
  primary: string;
}
export interface GameController {
  actions: ReadonlyArray<{ id: string; label: string }>;
  snapshot(): GameSnapshot;
  act(action: string): void;
  reset(): void;
  /** One valid illustrative operation, used only by the explicit automatic demonstration. */
  demo(): void;
}
