import type { MissionRobotDriver } from "../control/controlTypes";
import { ROBOT_IDS, SAFE_ZONE } from "./firebreakSeed";
import type {
  FirebreakSnapshot,
  MissionProgressEvent,
  MissionProposal,
  MissionReceipt,
  RobotId,
} from "./firebreakTypes";

export interface ExecuteMissionOptions {
  snapshot: FirebreakSnapshot;
  proposal: MissionProposal;
  driver: MissionRobotDriver;
  signal: AbortSignal;
  now: () => number;
  onProgress: (event: MissionProgressEvent) => void;
  executionLimitMs?: number;
}

export interface MissionExecutionResult {
  outcome: MissionReceipt["outcome"];
  snapshot: FirebreakSnapshot;
  receipt: MissionReceipt;
}

const activeProposals = new Set<string>();

function reasonText(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === "string" && reason) return reason;
  return fallback;
}

function progressRecord(snapshot: FirebreakSnapshot): Record<RobotId, number> {
  return Object.fromEntries(
    ROBOT_IDS.map((robotId) => [robotId, snapshot.robots[robotId].routeProgress]),
  ) as Record<RobotId, number>;
}

function batteryRecord(snapshot: FirebreakSnapshot): Record<RobotId, number> {
  return Object.fromEntries(
    ROBOT_IDS.map((robotId) => [robotId, snapshot.robots[robotId].battery]),
  ) as Record<RobotId, number>;
}

function createReceipt(
  proposal: MissionProposal,
  outcome: MissionReceipt["outcome"],
  startedAt: number,
  completedAt: number,
  snapshot: FirebreakSnapshot,
  reason: string | null,
): MissionReceipt {
  return {
    id: `RECEIPT-${proposal.id}-${completedAt}`,
    proposalId: proposal.id,
    outcome,
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),
    rescuedWorkers: Object.values(snapshot.workers).filter((worker) => worker.status === "safe")
      .length,
    fireContained: snapshot.hazards.fire.contained,
    containerSafe: snapshot.hazards.container.status === "safe",
    safetyViolations: outcome === "succeeded" ? 0 : 1,
    finalBattery: batteryRecord(snapshot),
    partialProgress: progressRecord(snapshot),
    reason,
  };
}

function applySuccessfulOutcome(
  snapshot: FirebreakSnapshot,
  proposal: MissionProposal,
): FirebreakSnapshot {
  const next = structuredClone(snapshot);
  for (const robotId of ROBOT_IDS) {
    const route = proposal.routes[robotId];
    next.robots[robotId] = {
      ...next.robots[robotId],
      position: { ...route.waypoints.at(-1)!.position },
      battery: route.predictedBatteryEnd,
      routeProgress: 1,
      status: "complete",
    };
  }
  next.workers["WORKER-A"] = {
    ...next.workers["WORKER-A"],
    status: "safe",
    assignedRobot: "MEDIC-2",
    position: { x: -12, y: 0.9, z: 6 },
  };
  next.workers["WORKER-B"] = {
    ...next.workers["WORKER-B"],
    status: "safe",
    assignedRobot: "HAUL-4",
    position: { x: -9, y: 0.9, z: 8 },
  };
  next.hazards = {
    ...next.hazards,
    scanned: true,
    smoke: 0.08,
    powerIsolated: true,
    fire: { ...next.hazards.fire, intensity: 0.08, contained: true },
    container: {
      ...next.hazards.container,
      position: { ...next.hazards.container.targetPosition },
      status: "safe",
    },
  };
  next.objectives = next.objectives.map((objective) => ({
    ...objective,
    status: "complete",
  }));
  next.safeZone = SAFE_ZONE.map((point) => ({ ...point }));
  next.elapsedMs = Math.min(
    next.durationLimitMs,
    next.elapsedMs + Math.max(...ROBOT_IDS.map((robotId) => proposal.routes[robotId].durationMs)),
  );
  next.phase = "resolved";
  next.revision += 1;
  return next;
}

export async function executeMission(
  options: ExecuteMissionOptions,
): Promise<MissionExecutionResult> {
  const { proposal, driver, signal, now, onProgress } = options;
  if (activeProposals.has(proposal.id)) {
    throw new Error(`Mission ${proposal.id} is already executing`);
  }
  if (
    proposal.status !== "authorized" ||
    proposal.authorizedAt === null ||
    proposal.expiresAt === null ||
    proposal.expiresAt <= now() ||
    proposal.consumedAt !== null
  ) {
    throw new Error("Mission authority is not active");
  }

  activeProposals.add(proposal.id);
  const original = structuredClone(options.snapshot);
  const authority = structuredClone(proposal);
  const startedAt = now();
  const working = structuredClone(original);
  working.phase = "executing";
  const executionController = new AbortController();
  const abortFromCaller = () => executionController.abort(signal.reason);
  if (signal.aborted) abortFromCaller();
  else signal.addEventListener("abort", abortFromCaller, { once: true });
  const executionLimitMs = Math.max(1, Math.min(45_000, options.executionLimitMs ?? 45_000));
  let deadlineExceeded = false;
  const deadline = globalThis.setTimeout(() => {
    deadlineExceeded = true;
    executionController.abort(new Error("Mission exceeded the 45-second execution limit"));
  }, executionLimitMs);
  const executionSignal = executionController.signal;

  try {
    if (executionSignal.aborted) throw executionSignal.reason;
    let routeFailure: unknown;
    const routes = ROBOT_IDS.map((robotId) =>
      driver
        .executeRoute(authority.routes[robotId], {
          signal: executionSignal,
          onProgress(event) {
            working.robots[event.robotId] = {
              ...working.robots[event.robotId],
              status: event.status,
              routeProgress: Math.max(0, Math.min(1, event.progress)),
            };
            onProgress(event);
          },
        })
        .catch((error: unknown) => {
          routeFailure ??= error;
          executionController.abort(error);
          throw error;
        }),
    );
    await Promise.allSettled(routes);
    if (routeFailure) throw routeFailure;
    if (executionSignal.aborted) throw executionSignal.reason;

    const snapshot = applySuccessfulOutcome(working, authority);
    const receipt = createReceipt(authority, "succeeded", startedAt, now(), snapshot, null);
    snapshot.receipt = receipt;
    return { outcome: "succeeded", snapshot, receipt };
  } catch (error) {
    const cancelled = signal.aborted || deadlineExceeded;
    const reason = reasonText(
      cancelled ? executionSignal.reason : error,
      cancelled ? "Mission cancelled" : "Robot driver failed",
    );
    await driver.stopAll(reason);
    const snapshot = driver.mode === "browser" ? structuredClone(original) : working;
    const receipt = createReceipt(
      authority,
      cancelled ? "cancelled" : "failed",
      startedAt,
      now(),
      working,
      reason,
    );
    snapshot.receipt = receipt;
    return { outcome: receipt.outcome, snapshot, receipt };
  } finally {
    globalThis.clearTimeout(deadline);
    signal.removeEventListener("abort", abortFromCaller);
    activeProposals.delete(proposal.id);
  }
}
