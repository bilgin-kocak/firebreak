import { describe, expect, it } from "vitest";

import { createFirebreakSeed } from "../domain/firebreakSeed";
import { simulateCoordinatedMission } from "../domain/missionSimulator";
import {
  compileMissionProposal,
  validateSafetyEnvelope,
} from "../domain/safetyCompiler";
import {
  FIREBREAK_MISSION_KEY,
  FIREBREAK_UI_KEY,
  FIREBREAK_WORLD_KEY,
  loadFirebreakState,
  saveFirebreakState,
  type FirebreakPersistedState,
  type PersistenceStorage,
} from "./firebreakPersistence";

function memoryStorage(): PersistenceStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function validState(): FirebreakPersistedState {
  const world = createFirebreakSeed();
  world.phase = "active";
  const simulation = simulateCoordinatedMission(world);
  const checks = validateSafetyEnvelope(world, simulation);
  const proposal = compileMissionProposal(world, simulation, checks, 1_000);
  return {
    world,
    mission: { simulation, checks, proposal, progress: [], receipt: null },
    ui: {
      cameraMode: "overview",
      missionControlOpen: false,
      proposalOpen: false,
      reducedEffects: false,
      touchControlsEnabled: false,
    },
  };
}

describe("Firebreak persistence", () => {
  it("round-trips valid world, mission, and UI envelopes", () => {
    const storage = memoryStorage();
    const state = validState();

    saveFirebreakState(storage, state);
    const loaded = loadFirebreakState(storage, 2_000);

    expect(loaded.recovered).toBe(false);
    expect(loaded.state).toEqual(state);
  });

  it("recovers independently from corrupt envelopes", () => {
    const storage = memoryStorage();
    const state = validState();
    saveFirebreakState(storage, state);
    storage.setItem(FIREBREAK_WORLD_KEY, "not-json");
    storage.setItem(FIREBREAK_UI_KEY, JSON.stringify({ version: 99 }));

    const loaded = loadFirebreakState(storage, 2_000);

    expect(loaded.recovered).toBe(true);
    expect(loaded.state.world).toEqual(createFirebreakSeed());
    expect(loaded.state.ui.cameraMode).toBe("overview");
    expect(loaded.state.mission.proposal).toBeNull();
  });

  it("discards stale authority bound to another world revision", () => {
    const storage = memoryStorage();
    const state = validState();
    state.world.revision += 1;
    saveFirebreakState(storage, state);

    const loaded = loadFirebreakState(storage, 2_000);

    expect(loaded.recovered).toBe(true);
    expect(loaded.state.mission.simulation).toBeNull();
    expect(loaded.state.mission.checks).toBeNull();
    expect(loaded.state.mission.proposal).toBeNull();
  });

  it("requires renewed human approval after a page reload", () => {
    const storage = memoryStorage();
    const state = validState();
    state.mission.proposal = {
      ...state.mission.proposal!,
      status: "authorized",
      authorizedAt: 1_500,
      expiresAt: 301_500,
    };
    saveFirebreakState(storage, state);

    const loaded = loadFirebreakState(storage, 2_000);

    expect(loaded.recovered).toBe(true);
    expect(loaded.state.mission.proposal).toMatchObject({
      status: "staged",
      authorizedAt: null,
      expiresAt: null,
    });
  });

  it("uses the three required versioned storage keys", () => {
    const storage = memoryStorage();
    saveFirebreakState(storage, validState());

    expect(storage.getItem(FIREBREAK_WORLD_KEY)).not.toBeNull();
    expect(storage.getItem(FIREBREAK_MISSION_KEY)).not.toBeNull();
    expect(storage.getItem(FIREBREAK_UI_KEY)).not.toBeNull();
  });
});
