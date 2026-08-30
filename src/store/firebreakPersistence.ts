import { z } from "zod";

import {
  FirebreakSnapshotSchema,
  MissionProgressEventSchema,
  MissionProposalSchema,
  MissionReceiptSchema,
  MissionSimulationSchema,
  SafetyCheckReportSchema,
} from "../domain/firebreakSchemas";
import { createFirebreakSeed } from "../domain/firebreakSeed";
import type {
  FirebreakSnapshot,
  MissionProgressEvent,
  MissionProposal,
  MissionReceipt,
  MissionSimulation,
  SafetyCheckReport,
} from "../domain/firebreakTypes";
import { missionStateHash } from "../domain/missionSimulator";

export const FIREBREAK_WORLD_KEY = "firebreak.world.v1";
export const FIREBREAK_MISSION_KEY = "firebreak.missions.v1";
export const FIREBREAK_UI_KEY = "firebreak.ui.v1";

export interface PersistenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedMissionState {
  simulation: MissionSimulation | null;
  checks: SafetyCheckReport | null;
  proposal: MissionProposal | null;
  progress: MissionProgressEvent[];
  receipt: MissionReceipt | null;
}

export interface PersistedUiState {
  cameraMode: "overview" | "follow" | "free";
  missionControlOpen: boolean;
  proposalOpen: boolean;
  reducedEffects: boolean;
  touchControlsEnabled: boolean;
}

export interface FirebreakPersistedState {
  world: FirebreakSnapshot;
  mission: PersistedMissionState;
  ui: PersistedUiState;
}

const MissionStateSchema = z
  .object({
    simulation: MissionSimulationSchema.nullable(),
    checks: SafetyCheckReportSchema.nullable(),
    proposal: MissionProposalSchema.nullable(),
    progress: z.array(MissionProgressEventSchema).max(200),
    receipt: MissionReceiptSchema.nullable(),
  })
  .strict();

const UiStateSchema = z
  .object({
    cameraMode: z.enum(["overview", "follow", "free"]),
    missionControlOpen: z.boolean(),
    proposalOpen: z.boolean(),
    reducedEffects: z.boolean(),
    touchControlsEnabled: z.boolean(),
  })
  .strict();

const WorldEnvelopeSchema = z
  .object({ version: z.literal(1), data: FirebreakSnapshotSchema })
  .strict();
const MissionEnvelopeSchema = z
  .object({ version: z.literal(1), data: MissionStateSchema })
  .strict();
const UiEnvelopeSchema = z.object({ version: z.literal(1), data: UiStateSchema }).strict();

export const defaultMissionState = (): PersistedMissionState => ({
  simulation: null,
  checks: null,
  proposal: null,
  progress: [],
  receipt: null,
});

export const defaultUiState = (): PersistedUiState => ({
  cameraMode: "overview",
  missionControlOpen: false,
  proposalOpen: false,
  reducedEffects: false,
  touchControlsEnabled: false,
});

function parseEnvelope<T>(
  storage: PersistenceStorage | undefined,
  key: string,
  schema: z.ZodType<T>,
): { value: T | null; recovered: boolean } {
  if (!storage) return { value: null, recovered: false };
  const raw = storage.getItem(key);
  if (raw === null) return { value: null, recovered: false };
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success
      ? { value: result.data, recovered: false }
      : { value: null, recovered: true };
  } catch {
    return { value: null, recovered: true };
  }
}

export function saveFirebreakState(
  storage: PersistenceStorage | undefined,
  state: FirebreakPersistedState,
): void {
  if (!storage) return;
  storage.setItem(FIREBREAK_WORLD_KEY, JSON.stringify({ version: 1, data: state.world }));
  storage.setItem(FIREBREAK_MISSION_KEY, JSON.stringify({ version: 1, data: state.mission }));
  storage.setItem(FIREBREAK_UI_KEY, JSON.stringify({ version: 1, data: state.ui }));
}

export function loadFirebreakState(
  storage: PersistenceStorage | undefined,
  now: number,
): { state: FirebreakPersistedState; recovered: boolean } {
  const worldResult = parseEnvelope(storage, FIREBREAK_WORLD_KEY, WorldEnvelopeSchema);
  const missionResult = parseEnvelope(storage, FIREBREAK_MISSION_KEY, MissionEnvelopeSchema);
  const uiResult = parseEnvelope(storage, FIREBREAK_UI_KEY, UiEnvelopeSchema);
  let world = worldResult.value?.data ?? createFirebreakSeed();
  let mission = missionResult.value?.data ?? defaultMissionState();
  const ui = uiResult.value?.data ?? defaultUiState();
  let recovered = worldResult.recovered || missionResult.recovered || uiResult.recovered;

  const simulationCurrent =
    mission.simulation !== null &&
    mission.simulation.incidentRevision === world.revision &&
    mission.simulation.stateHash === missionStateHash(world);
  const completedReceipt =
    world.phase === "resolved" && mission.receipt?.outcome === "succeeded" ? mission.receipt : null;
  if (completedReceipt) {
    mission = { ...defaultMissionState(), receipt: completedReceipt };
  } else if (worldResult.recovered) {
    mission = defaultMissionState();
  } else if (mission.simulation && !simulationCurrent) {
    mission = defaultMissionState();
    recovered = true;
  } else if (
    mission.checks &&
    (!mission.simulation ||
      mission.checks.simulationId !== mission.simulation.id ||
      mission.checks.stateHash !== mission.simulation.stateHash)
  ) {
    mission = { ...defaultMissionState(), simulation: mission.simulation };
    recovered = true;
  } else if (
    mission.proposal &&
    (!mission.simulation ||
      !mission.checks ||
      mission.proposal.simulationId !== mission.simulation.id ||
      mission.proposal.incidentRevision !== world.revision ||
      mission.proposal.stateHash !== missionStateHash(world))
  ) {
    mission = { ...mission, proposal: null, progress: [] };
    recovered = true;
  }

  if (mission.proposal?.status === "authorized" || mission.proposal?.status === "registered") {
    mission = {
      ...mission,
      proposal: {
        ...mission.proposal,
        status: "staged",
        authorizedAt: null,
        expiresAt: null,
      },
    };
    world = { ...world, phase: "planned" };
    recovered = true;
  } else if (
    mission.proposal &&
    (["executing", "completed", "cancelled", "failed", "expired", "revoked"] as const).includes(
      mission.proposal.status as
        "executing" | "completed" | "cancelled" | "failed" | "expired" | "revoked",
    )
  ) {
    mission = { ...mission, proposal: null, progress: [] };
    recovered = true;
  }

  if (
    mission.proposal?.expiresAt !== null &&
    mission.proposal?.expiresAt !== undefined &&
    mission.proposal.expiresAt <= now
  ) {
    mission = { ...mission, proposal: null, progress: [] };
    recovered = true;
  }

  if (world.phase === "executing") {
    world = { ...world, phase: "active" };
    mission = { ...mission, proposal: null, progress: [] };
    recovered = true;
  }

  return { state: { world, mission, ui }, recovered };
}

export function clearFirebreakState(storage: PersistenceStorage | undefined): void {
  storage?.removeItem(FIREBREAK_WORLD_KEY);
  storage?.removeItem(FIREBREAK_MISSION_KEY);
  storage?.removeItem(FIREBREAK_UI_KEY);
}

export function browserStorage(): PersistenceStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
