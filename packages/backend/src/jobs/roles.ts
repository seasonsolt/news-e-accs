// Which worker runs which queues and schedules. One worker runs everything (WORKER_ROLE=all, the default).
// A site can move the model work that needs little of the database (writing, translation, drawing) to a
// second machine sharing the same database: WORKER_ROLE=models there, WORKER_ROLE=core on the first.
// Work is "core" unless its definition says runsOn: "models". Each role writes its own heartbeat.
import { config } from "../config.ts";

export type WorkKind = "core" | "models";

/** Whether this worker runs work of `kind`. */
export const runsHere = (kind: WorkKind = "core") => config.workerRole === "all" || config.workerRole === kind;

/** This worker's heartbeat role (settings.heartbeat.<role>): the models worker keeps its own. */
export const heartbeatRole = () => (config.workerRole === "models" ? "worker-models" : "worker");
