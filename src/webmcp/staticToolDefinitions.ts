import { z } from "zod";

import { FirebreakError, type FirebreakSnapshot } from "../domain/firebreakTypes";
import { simulateCoordinatedMission } from "../domain/missionSimulator";
import { compileMissionProposal, validateSafetyEnvelope } from "../domain/safetyCompiler";
import { getFirebreakState, type FirebreakState } from "../store/useFirebreakStore";
import { successResult } from "./results";
import type { RegistryToolDefinition } from "./types";

export const STATIC_TOOL_NAMES = [
  "inspect_emergency",
  "scan_hazards",
  "inspect_fleet",
  "simulate_mission",
  "validate_safety_envelope",
  "stage_mission_tool",
  "list_mission_tools",
] as const;

export interface StaticToolDependencies {
  getState?: () => FirebreakState;
  now?: () => number;
}

const read = { readOnlyHint: true, untrustedContentHint: false } as const;
const write = { readOnlyHint: false, untrustedContentHint: false } as const;
const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const define = <T>(tool: RegistryToolDefinition<T>): RegistryToolDefinition<T> => tool;
const closedObject = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const incidentId = {
  type: "string",
  enum: ["WH-01"],
  description: "The visible Battery Bay B warehouse emergency.",
};

function requireActive(state: FirebreakState): FirebreakSnapshot {
  if (state.world.phase === "ready") {
    throw new FirebreakError(
      "EMERGENCY_NOT_ACTIVE",
      "Start emergency WH-01 before asking the fleet to investigate.",
    );
  }
  return state.world;
}

function requirePlanningOpen(state: FirebreakState): FirebreakSnapshot {
  const world = requireActive(state);
  if (world.phase !== "active") {
    throw new FirebreakError(
      "OPERATION_FAILED",
      "Planning is locked while a reviewed or executing mission authority exists.",
    );
  }
  return world;
}

function markHazardsScanned(world: FirebreakSnapshot, now: number): FirebreakSnapshot {
  const next = structuredClone(world);
  next.hazards.scanned = true;
  next.revision += 1;
  next.objectives = next.objectives.map((objective) =>
    objective.id === "scan-hazards" ? { ...objective, status: "complete" } : objective,
  );
  next.events = [
    ...next.events,
    {
      id: `tool-scan-${next.revision}`,
      atMs: Math.max(next.elapsedMs, now),
      kind: "tool" as const,
      message: "SCOUT-1 mapped both workers, the fire, and the collapse zone.",
    },
  ].slice(-200);
  return next;
}

export const createStaticToolDefinitions = (
  dependencies: StaticToolDependencies = {},
): RegistryToolDefinition<unknown>[] => {
  const getState = dependencies.getState ?? getFirebreakState;
  const now = dependencies.now ?? Date.now;

  return [
    define({
      name: "inspect_emergency",
      description:
        "Start here. Inspect emergency WH-01, the trapped workers, visible hazards, objectives, and current response phase. Read-only. Then call scan_hazards.",
      inputSchema: closedObject({ incidentId }, ["incidentId"]),
      annotations: read,
      inputValidator: strict({ incidentId: z.literal("WH-01") }),
      origin: "built_in",
      async execute() {
        const world = requireActive(getState());
        return successResult("EMERGENCY_INSPECTED", "Emergency WH-01 inspected.", {
          incidentId: world.incidentId,
          phase: world.phase,
          revision: world.revision,
          trappedWorkers: Object.values(world.workers).filter((worker) => worker.status !== "safe")
            .length,
          fireIntensity: world.hazards.fire.intensity,
          objectives: structuredClone(world.objectives),
          durationLimitMs: world.durationLimitMs,
          nextStep: "scan_hazards",
        });
      },
    }),
    define({
      name: "scan_hazards",
      description:
        "Call after inspect_emergency. Run a bounded thermal scan with SCOUT-1 and mark the workers, fire, hazardous container, and forbidden collapse zone. Then call inspect_fleet.",
      inputSchema: closedObject(
        {
          incidentId,
          sensorMode: { type: "string", enum: ["thermal"] },
        },
        ["incidentId", "sensorMode"],
      ),
      annotations: write,
      inputValidator: strict({
        incidentId: z.literal("WH-01"),
        sensorMode: z.literal("thermal"),
      }),
      origin: "built_in",
      async execute() {
        const state = getState();
        const scanned = markHazardsScanned(requirePlanningOpen(state), now());
        state.replaceWorld(scanned);
        return successResult("HAZARDS_SCANNED", "Thermal hazard map is current.", {
          revision: scanned.revision,
          workersLocated: 2,
          collapseZoneMarked: true,
          fireLocated: true,
          containerLocated: true,
          nextStep: "inspect_fleet",
        });
      },
    }),
    define({
      name: "inspect_fleet",
      description:
        "Call after scan_hazards. Inspect the four role-limited emergency robots, their health, battery, position, and readiness. Read-only. Then call simulate_mission.",
      inputSchema: closedObject({ incidentId }, ["incidentId"]),
      annotations: read,
      inputValidator: strict({ incidentId: z.literal("WH-01") }),
      origin: "built_in",
      async execute() {
        const world = requireActive(getState());
        return successResult("FLEET_INSPECTED", "Emergency fleet inspected.", {
          robotCount: Object.keys(world.robots).length,
          robots: Object.values(world.robots).map((robot) => ({
            id: robot.id,
            role: robot.role,
            battery: robot.battery,
            health: robot.health,
            status: robot.status,
            position: robot.position,
          })),
          nextStep: "simulate_mission",
        });
      },
    }),
    define({
      name: "simulate_mission",
      description:
        "Call after scan_hazards and inspect_fleet. Simulate synchronized, role-limited routes for the four robots without granting movement authority. Use the returned simulationId with validate_safety_envelope.",
      inputSchema: closedObject(
        {
          incidentId,
          strategy: { type: "string", enum: ["coordinated"] },
        },
        ["incidentId", "strategy"],
      ),
      annotations: write,
      inputValidator: strict({
        incidentId: z.literal("WH-01"),
        strategy: z.literal("coordinated"),
      }),
      origin: "built_in",
      async execute() {
        const state = getState();
        const world = requirePlanningOpen(state);
        if (!world.hazards.scanned) {
          throw new FirebreakError(
            "HAZARD_SCAN_REQUIRED",
            "A current thermal scan is required before route simulation.",
          );
        }
        const simulation = simulateCoordinatedMission(world);
        state.setSimulation(simulation);
        return successResult("MISSION_SIMULATED", "Coordinated mission simulated.", {
          simulationId: simulation.id,
          feasible: simulation.feasible,
          reasonCode: simulation.reasonCode,
          predictedDurationMs: simulation.durationMs,
          predictions: simulation.predictions,
          routes: structuredClone(simulation.routes),
          nextStep: "validate_safety_envelope",
        });
      },
    }),
    define({
      name: "validate_safety_envelope",
      description:
        "Call after simulate_mission with its returned simulationId. Evaluate eleven deterministic gates over the exact simulated routes and current warehouse state. If passed, call stage_mission_tool.",
      inputSchema: closedObject({ simulationId: { type: "string", minLength: 1 } }, [
        "simulationId",
      ]),
      annotations: read,
      inputValidator: strict({ simulationId: z.string().min(1) }),
      origin: "built_in",
      async execute(input) {
        const state = getState();
        requirePlanningOpen(state);
        const simulation = state.mission.simulation;
        if (!simulation || simulation.id !== input.simulationId) {
          throw new FirebreakError(
            "SIMULATION_NOT_FOUND",
            "Run a current mission simulation before validating safety.",
          );
        }
        const report = validateSafetyEnvelope(requireActive(state), simulation);
        state.setChecks(report);
        return successResult(
          "SAFETY_ENVELOPE_VALIDATED",
          report.passed ? "All eleven safety gates passed." : "The mission is blocked.",
          {
            passed: report.passed,
            checkCount: report.checks.length,
            failedCheckIds: report.checks
              .filter((check) => check.status === "failed")
              .map((check) => check.id),
            checks: report.checks,
            nextStep: report.passed ? "stage_mission_tool" : "simulate_mission",
          },
        );
      },
    }),
    define({
      name: "stage_mission_tool",
      description:
        "Call only after validate_safety_envelope passes. Compile that simulation into a visible proposal, then stop: staging cannot register or execute the dynamic tool, and only the visible human control can authorize it.",
      inputSchema: closedObject(
        {
          simulationId: { type: "string", minLength: 1 },
          toolName: { type: "string", enum: ["execute_rescue_mission"] },
        },
        ["simulationId", "toolName"],
      ),
      annotations: write,
      inputValidator: strict({
        simulationId: z.string().min(1),
        toolName: z.literal("execute_rescue_mission"),
      }),
      origin: "built_in",
      async execute(input) {
        const state = getState();
        requirePlanningOpen(state);
        const simulation = state.mission.simulation;
        if (!simulation || simulation.id !== input.simulationId) {
          throw new FirebreakError(
            "SIMULATION_NOT_FOUND",
            "A current simulation is required before staging authority.",
          );
        }
        const report = state.mission.checks;
        if (!report || report.simulationId !== simulation.id || !report.passed) {
          throw new FirebreakError(
            "SAFETY_CHECKS_FAILED",
            "All eleven current safety checks must pass before staging.",
          );
        }
        let proposal;
        try {
          proposal = compileMissionProposal(state.world, simulation, report, now());
        } catch {
          throw new FirebreakError(
            "SIMULATION_STALE",
            "The warehouse changed after simulation; generate a new mission.",
          );
        }
        state.stageProposal(proposal);
        return successResult("MISSION_TOOL_STAGED", "Mission tool proposal is ready for review.", {
          proposalId: proposal.id,
          toolName: input.toolName,
          status: proposal.status,
          requiresHumanAuthorization: true,
          oneUse: true,
          allowedRobotIds: proposal.allowedRobotIds,
          expiresAfterAuthorizationMs: 300_000,
          nextStep: "await_human_authorization",
        });
      },
    }),
    define({
      name: "list_mission_tools",
      description:
        "List the staged mission proposal and the currently registered dynamic mission authority. Read-only.",
      inputSchema: closedObject({ incidentId }, ["incidentId"]),
      annotations: read,
      inputValidator: strict({ incidentId: z.literal("WH-01") }),
      origin: "built_in",
      async execute() {
        const state = getState();
        requireActive(state);
        const proposal = state.mission.proposal;
        return successResult("MISSION_TOOLS_LISTED", "Mission authority surface inspected.", {
          staged: proposal
            ? {
                id: proposal.id,
                name: "execute_rescue_mission",
                status: proposal.status,
                oneUse: proposal.oneUse,
              }
            : null,
          dynamicRegistered: state.webmcp.registeredToolNames.includes("execute_rescue_mission"),
        });
      },
    }),
  ];
};
