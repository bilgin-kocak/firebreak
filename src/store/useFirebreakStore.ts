import { create } from "zustand";

import { FirebreakSnapshotSchema } from "../domain/firebreakSchemas";
import { createFirebreakSeed } from "../domain/firebreakSeed";
import type {
  FirebreakSnapshot,
  MissionProgressEvent,
  MissionProposal,
  MissionReceipt,
  MissionSimulation,
  RobotId,
  SafetyCheckReport,
} from "../domain/firebreakTypes";
import type { MissionExecutionResult } from "../domain/missionExecutor";
import { missionStateHash } from "../domain/missionSimulator";
import {
  browserStorage,
  defaultMissionState,
  defaultUiState,
  loadFirebreakState,
  saveFirebreakState,
  type PersistedMissionState,
  type PersistedUiState,
  type PersistenceStorage,
} from "./firebreakPersistence";

export interface FirebreakWebMCPState {
  mode: "native" | "memory" | "unavailable";
  registeredToolNames: string[];
  lastToolChangeAt: number | null;
  toolCallCount: number;
}

export interface FirebreakState {
  world: FirebreakSnapshot;
  mission: PersistedMissionState;
  ui: PersistedUiState;
  webmcp: FirebreakWebMCPState;
  persistenceRecovered: boolean;
  setPersistenceStorage(storage: PersistenceStorage | undefined): void;
  hydrate(now?: number): void;
  startEmergency(): void;
  advanceClock(deltaMs: number): boolean;
  replaceWorld(snapshot: FirebreakSnapshot): void;
  selectRobot(robotId: RobotId): void;
  setSimulation(simulation: MissionSimulation): void;
  setChecks(checks: SafetyCheckReport): void;
  stageProposal(proposal: MissionProposal): void;
  authorizeProposal(proposalId: string, now?: number): MissionProposal;
  markProposalRegistered(proposalId: string): MissionProposal;
  beginExecution(proposalId: string): void;
  applyProgress(event: MissionProgressEvent): void;
  finishExecution(result: MissionExecutionResult): void;
  revokeMission(reason?: string): void;
  setReducedEffects(reduced: boolean): void;
  setCameraMode(mode: PersistedUiState["cameraMode"]): void;
  setMissionControlOpen(open: boolean): void;
  setProposalOpen(open: boolean): void;
  setTouchControlsEnabled(enabled: boolean): void;
  setWebMCP(patch: Partial<FirebreakWebMCPState>): void;
  recordToolCall(): void;
  resetDemo(): void;
}

const initialWebMCP = (): FirebreakWebMCPState => ({
  mode: "memory",
  registeredToolNames: [],
  lastToolChangeAt: null,
  toolCallCount: 0,
});

let persistenceStorage: PersistenceStorage | undefined = browserStorage();

function appendEvent(
  world: FirebreakSnapshot,
  kind: FirebreakSnapshot["events"][number]["kind"],
  message: string,
): FirebreakSnapshot {
  return {
    ...world,
    events: [
      ...world.events,
      {
        id: `${kind}-${world.revision}-${world.events.length}`,
        atMs: world.elapsedMs,
        kind,
        message,
      },
    ].slice(-200),
  };
}

export const useFirebreakStore = create<FirebreakState>((set, get) => {
  function persist(): void {
    const state = get();
    saveFirebreakState(persistenceStorage, {
      world: state.world,
      mission: state.mission,
      ui: state.ui,
    });
  }

  function update(recipe: (state: FirebreakState) => Partial<FirebreakState>): void {
    set((state) => recipe(state));
    persist();
  }

  return {
    world: createFirebreakSeed(),
    mission: defaultMissionState(),
    ui: defaultUiState(),
    webmcp: initialWebMCP(),
    persistenceRecovered: false,
    setPersistenceStorage(storage) {
      persistenceStorage = storage;
    },
    hydrate(now = Date.now()) {
      const loaded = loadFirebreakState(persistenceStorage, now);
      set({
        world: loaded.state.world,
        mission: loaded.state.mission,
        ui: loaded.state.ui,
        persistenceRecovered: loaded.recovered,
      });
      persist();
    },
    startEmergency() {
      if (get().world.phase !== "ready") return;
      update((state) => ({
        world: appendEvent(
          {
            ...state.world,
            phase: "active",
            revision: state.world.revision + 1,
            hazards: { ...state.world.hazards, smoke: 0.45 },
          },
          "system",
          "Battery Bay B ignited. Emergency WH-01 is active.",
        ),
      }));
    },
    advanceClock(deltaMs) {
      const world = get().world;
      if (!["active", "planned", "authorized", "executing"].includes(world.phase)) return false;
      const elapsedMs = Math.min(
        world.durationLimitMs,
        world.elapsedMs + Math.max(0, Math.min(1_000, Number.isFinite(deltaMs) ? deltaMs : 0)),
      );
      const expired = elapsedMs >= world.durationLimitMs;
      const advance = (state: FirebreakState): Partial<FirebreakState> => ({
        world: expired
          ? appendEvent(
              {
                ...state.world,
                elapsedMs,
                phase: "failed",
                robots: Object.fromEntries(
                  Object.entries(state.world.robots).map(([id, robot]) => [
                    id,
                    { ...robot, status: "stopped" },
                  ]),
                ) as FirebreakSnapshot["robots"],
                objectives: state.world.objectives.map((objective) =>
                  objective.status === "complete"
                    ? objective
                    : { ...objective, status: "failed" as const },
                ),
              },
              "warning",
              "The 90-second rescue window expired. Fleet stopped.",
            )
          : { ...state.world, elapsedMs },
      });
      if (world.phase === "executing") set((state) => advance(state));
      else update((state) => advance(state));
      return expired;
    },
    replaceWorld(snapshot) {
      const parsed = FirebreakSnapshotSchema.parse(snapshot) as FirebreakSnapshot;
      if (parsed.phase === "executing") set({ world: parsed });
      else update(() => ({ world: parsed }));
    },
    selectRobot(robotId) {
      update((state) => ({
        world: { ...state.world, selectedRobotId: robotId },
      }));
    },
    setSimulation(simulation) {
      const state = get();
      if (
        simulation.incidentRevision !== state.world.revision ||
        simulation.stateHash !== missionStateHash(state.world)
      ) {
        throw new Error("Simulation is stale for the current emergency");
      }
      update((current) => ({
        mission: { ...current.mission, simulation: structuredClone(simulation) },
        world: {
          ...current.world,
          routes: Object.fromEntries(
            Object.entries(simulation.routes).map(([robotId, route]) => [
              robotId,
              route.waypoints.map((point) => ({ ...point.position })),
            ]),
          ) as FirebreakSnapshot["routes"],
        },
      }));
    },
    setChecks(checks) {
      const simulation = get().mission.simulation;
      if (!simulation || checks.simulationId !== simulation.id) {
        throw new Error("Safety checks do not match the current simulation");
      }
      update((state) => ({ mission: { ...state.mission, checks } }));
    },
    stageProposal(proposal) {
      const state = get();
      if (
        !state.mission.simulation ||
        proposal.simulationId !== state.mission.simulation.id ||
        proposal.incidentRevision !== state.world.revision
      ) {
        throw new Error("Proposal is stale for the current simulation");
      }
      update((current) => ({
        mission: { ...current.mission, proposal: structuredClone(proposal) },
        world: { ...current.world, phase: "planned" },
        ui: { ...current.ui, proposalOpen: true },
      }));
    },
    authorizeProposal(proposalId, now = Date.now()) {
      const state = get();
      const proposal = state.mission.proposal;
      if (
        !proposal ||
        proposal.id !== proposalId ||
        proposal.status !== "staged" ||
        !state.mission.checks?.passed ||
        state.mission.checks.simulationId !== proposal.simulationId ||
        proposal.incidentRevision !== state.world.revision ||
        proposal.stateHash !== missionStateHash(state.world)
      ) {
        throw new Error("Human authorization requires current passing safety checks");
      }
      const authorized: MissionProposal = {
        ...structuredClone(proposal),
        status: "authorized",
        authorizedAt: now,
        expiresAt: now + 300_000,
      };
      update((current) => ({
        mission: { ...current.mission, proposal: authorized },
        world: { ...current.world, phase: "authorized" },
        ui: { ...current.ui, proposalOpen: false },
      }));
      return authorized;
    },
    markProposalRegistered(proposalId) {
      const proposal = get().mission.proposal;
      if (!proposal || proposal.id !== proposalId || proposal.status !== "authorized") {
        throw new Error("Only current human-authorized authority can be registered");
      }
      const registered: MissionProposal = { ...proposal, status: "registered" };
      update((state) => ({
        mission: { ...state.mission, proposal: registered },
      }));
      return registered;
    },
    beginExecution(proposalId) {
      const proposal = get().mission.proposal;
      if (
        !proposal ||
        proposal.id !== proposalId ||
        !["authorized", "registered"].includes(proposal.status)
      ) {
        throw new Error("Mission is not authorized");
      }
      set((state) => ({
        mission: {
          ...state.mission,
          progress: [],
          proposal: { ...proposal, status: "executing" },
        },
        world: { ...state.world, phase: "executing" },
      }));
    },
    applyProgress(event) {
      set((state) => ({
        mission: {
          ...state.mission,
          progress: [...state.mission.progress, event].slice(-200),
        },
        world: {
          ...state.world,
          robots: {
            ...state.world.robots,
            [event.robotId]: {
              ...state.world.robots[event.robotId],
              routeProgress: event.progress,
              status: event.status,
            },
          },
        },
      }));
    },
    finishExecution(result) {
      update((state) => ({
        world: result.snapshot,
        mission: {
          ...state.mission,
          receipt: result.receipt,
          proposal: state.mission.proposal
            ? {
                ...state.mission.proposal,
                status:
                  result.outcome === "succeeded"
                    ? "completed"
                    : result.outcome === "cancelled"
                      ? "cancelled"
                      : "failed",
                consumedAt: result.receipt.completedAt,
              }
            : null,
        },
      }));
    },
    revokeMission(reason = "Mission authority revoked") {
      update((state) => ({
        mission: {
          ...state.mission,
          proposal: state.mission.proposal
            ? { ...state.mission.proposal, status: "revoked" }
            : null,
        },
        world: appendEvent(
          {
            ...state.world,
            phase: ["resolved", "failed"].includes(state.world.phase)
              ? state.world.phase
              : "active",
          },
          "warning",
          reason,
        ),
      }));
    },
    setReducedEffects(reducedEffects) {
      update((state) => ({ ui: { ...state.ui, reducedEffects } }));
    },
    setCameraMode(cameraMode) {
      update((state) => ({ ui: { ...state.ui, cameraMode } }));
    },
    setMissionControlOpen(missionControlOpen) {
      update((state) => ({ ui: { ...state.ui, missionControlOpen } }));
    },
    setProposalOpen(proposalOpen) {
      update((state) => ({ ui: { ...state.ui, proposalOpen } }));
    },
    setTouchControlsEnabled(touchControlsEnabled) {
      update((state) => ({ ui: { ...state.ui, touchControlsEnabled } }));
    },
    setWebMCP(patch) {
      set((state) => ({ webmcp: { ...state.webmcp, ...patch } }));
    },
    recordToolCall() {
      set((state) => ({
        webmcp: { ...state.webmcp, toolCallCount: state.webmcp.toolCallCount + 1 },
      }));
    },
    resetDemo() {
      const reducedEffects = get().ui.reducedEffects;
      set({
        world: createFirebreakSeed(),
        mission: defaultMissionState(),
        ui: { ...defaultUiState(), reducedEffects },
        webmcp: initialWebMCP(),
        persistenceRecovered: false,
      });
      persist();
    },
  };
});

export const getFirebreakState = (): FirebreakState => useFirebreakStore.getState();

export type { MissionReceipt };
