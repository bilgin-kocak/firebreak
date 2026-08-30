import { z } from "zod";

import type { MissionRobotDriver } from "../control/controlTypes";
import { executeMission } from "../domain/missionExecutor";
import { missionStateHash } from "../domain/missionSimulator";
import { validateSafetyEnvelope } from "../domain/safetyCompiler";
import {
  FirebreakError,
  type MissionProposal,
} from "../domain/firebreakTypes";
import { getFirebreakState } from "../store/useFirebreakStore";
import type { ToolRegistry } from "./registry";
import { successResult } from "./results";
import type { RegistryToolDefinition } from "./types";

const TOOL_NAME = "execute_rescue_mission";
const inputValidator = z.object({ strategy: z.literal("coordinated") }).strict();
const inputSchema = {
  type: "object",
  properties: {
    strategy: {
      type: "string",
      enum: ["coordinated"],
      description: "Execute only the exact reviewed coordinated route plan.",
    },
  },
  required: ["strategy"],
  additionalProperties: false,
} as const;

export interface DynamicMissionToolManagerDependencies {
  driver: MissionRobotDriver;
  now?: () => number;
}

function combineAbortSignals(
  signals: Array<AbortSignal | undefined>,
): { signal: AbortSignal; cleanup(): void } {
  const controller = new AbortController();
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  const listeners = new Map<AbortSignal, () => void>();
  for (const signal of active) {
    const abort = () => controller.abort(signal.reason);
    listeners.set(signal, abort);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      for (const [signal, listener] of listeners) {
        signal.removeEventListener("abort", listener);
      }
    },
  };
}

export class DynamicMissionToolManager {
  private controller: AbortController | null = null;
  private executing = false;
  private readonly now: () => number;

  public constructor(
    private readonly registry: ToolRegistry,
    private readonly dependencies: DynamicMissionToolManagerDependencies,
  ) {
    this.now = dependencies.now ?? Date.now;
  }

  public async approveAndRegister(proposalId: string): Promise<MissionProposal> {
    const state = getFirebreakState();
    const proposal = state.mission.proposal;
    if (!proposal || proposal.id !== proposalId || proposal.status !== "staged") {
      throw new FirebreakError(
        "HUMAN_AUTHORIZATION_REQUIRED",
        "Use the visible Authorize Mission control for the current staged proposal.",
      );
    }
    this.assertCurrent(proposal);

    const authorized = state.authorizeProposal(proposalId, this.now());
    const controller = new AbortController();
    try {
      await this.registry.register(this.createDefinition(authorized.id), {
        signal: controller.signal,
      });
      this.controller = controller;
      return getFirebreakState().markProposalRegistered(authorized.id);
    } catch (error) {
      controller.abort(error);
      getFirebreakState().revokeMission("Mission registration failed safely.");
      throw error;
    }
  }

  public revoke(reason = "Mission authority revoked by operator"): void {
    this.controller?.abort(new Error(reason));
    this.controller = null;
    const proposal = getFirebreakState().mission.proposal;
    if (proposal && !["completed", "cancelled", "failed"].includes(proposal.status)) {
      getFirebreakState().revokeMission(reason);
    }
  }

  /** @deprecated Retained only while the legacy view is replaced by Firebreak controls. */
  public disable(_name: string): void {
    this.revoke("Mission authority disabled by operator");
  }

  /** @deprecated Retained only while the legacy view is replaced by Firebreak controls. */
  public delete(_name: string): void {
    this.revoke("Mission authority deleted by operator");
  }

  public async destroy(): Promise<void> {
    this.controller?.abort(new Error("Firebreak runtime stopped"));
    this.controller = null;
    await this.registry.settleToolChanges();
  }

  private assertCurrent(proposal: MissionProposal): void {
    const state = getFirebreakState();
    const simulation = state.mission.simulation;
    if (!simulation || simulation.id !== proposal.simulationId) {
      throw new FirebreakError("SIMULATION_NOT_FOUND", "Mission simulation proof is missing.");
    }
    if (
      proposal.incidentRevision !== state.world.revision ||
      proposal.stateHash !== missionStateHash(state.world) ||
      simulation.incidentRevision !== state.world.revision
    ) {
      throw new FirebreakError(
        "SIMULATION_STALE",
        "The warehouse changed after the mission was simulated.",
      );
    }
    const report = validateSafetyEnvelope(state.world, simulation);
    if (!report.passed) {
      throw new FirebreakError(
        "SAFETY_CHECKS_FAILED",
        "The live mission no longer passes the safety envelope.",
        {
          failedCheckIds: report.checks
            .filter((check) => check.status === "failed")
            .map((check) => check.id),
        },
      );
    }
  }

  private createDefinition(
    proposalId: string,
  ): RegistryToolDefinition<z.infer<typeof inputValidator>> {
    return {
      name: TOOL_NAME,
      description:
        "Execute the exact human-authorized, one-use coordinated rescue mission. Moves only the four allowlisted robots on the reviewed routes, then unregisters itself.",
      inputSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      inputValidator,
      origin: "human_approved_workflow",
      execute: async (_input, callSignal) => {
        if (this.executing) {
          throw new FirebreakError("AUTHORITY_USED", "The one-use mission is already executing.");
        }
        const state = getFirebreakState();
        const live = state.mission.proposal;
        if (!live || live.id !== proposalId || live.status !== "registered") {
          throw new FirebreakError(
            "HUMAN_AUTHORIZATION_REQUIRED",
            "The mission tool does not have current human authority.",
          );
        }
        if (live.consumedAt !== null) {
          throw new FirebreakError("AUTHORITY_USED", "The mission authority was already used.");
        }
        if (live.expiresAt === null || live.expiresAt <= this.now()) {
          throw new FirebreakError("AUTHORITY_EXPIRED", "The mission authority expired.");
        }
        this.assertCurrent(live);

        this.executing = true;
        const before = structuredClone(state.world);
        const authority: MissionProposal = { ...structuredClone(live), status: "authorized" };
        state.beginExecution(live.id);
        const combined = combineAbortSignals([callSignal, this.controller?.signal]);
        try {
          const result = await executeMission({
            snapshot: before,
            proposal: authority,
            driver: this.dependencies.driver,
            signal: combined.signal,
            now: this.now,
            onProgress: (event) => getFirebreakState().applyProgress(event),
          });
          if (result.outcome !== "succeeded") result.snapshot.phase = "active";
          getFirebreakState().finishExecution(result);

          this.controller?.abort(
            new Error(
              result.outcome === "succeeded"
                ? "One-use mission completed"
                : result.receipt.reason ?? "Mission ended",
            ),
          );
          this.controller = null;
          await this.registry.settleToolChanges();

          if (result.outcome === "cancelled") {
            throw new FirebreakError(
              "EXECUTION_CANCELLED",
              result.receipt.reason ?? "Mission execution was cancelled.",
            );
          }
          if (result.outcome === "failed") {
            throw new FirebreakError(
              "OPERATION_FAILED",
              result.receipt.reason ?? "A robot driver failed safely.",
            );
          }
          return successResult("MISSION_EXECUTED", "Workers rescued and Battery Bay B secured.", {
            receiptId: result.receipt.id,
            rescuedWorkers: result.receipt.rescuedWorkers,
            fireContained: result.receipt.fireContained,
            containerSafe: result.receipt.containerSafe,
            safetyViolations: result.receipt.safetyViolations,
            durationMs: result.receipt.durationMs,
          });
        } finally {
          combined.cleanup();
          this.executing = false;
        }
      },
    };
  }
}
