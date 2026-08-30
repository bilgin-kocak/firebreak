import { beforeEach, describe, expect, it } from "vitest";

import { createFirebreakSeed } from "../domain/firebreakSeed";
import { simulateCoordinatedMission } from "../domain/missionSimulator";
import { compileMissionProposal, validateSafetyEnvelope } from "../domain/safetyCompiler";
import { useFirebreakStore } from "./useFirebreakStore";

function plannedMission(now = 1_000) {
  const snapshot = useFirebreakStore.getState().world;
  const simulation = simulateCoordinatedMission(snapshot);
  const checks = validateSafetyEnvelope(snapshot, simulation);
  const proposal = compileMissionProposal(snapshot, simulation, checks, now);
  return { simulation, checks, proposal };
}

describe("useFirebreakStore", () => {
  beforeEach(() => {
    useFirebreakStore.getState().setPersistenceStorage(undefined);
    useFirebreakStore.getState().resetDemo();
  });

  it("moves through the complete human-agent mission lifecycle", () => {
    const store = useFirebreakStore.getState();
    store.startEmergency();
    expect(useFirebreakStore.getState().world.phase).toBe("active");

    const { simulation, checks, proposal } = plannedMission();
    store.setSimulation(simulation);
    store.setChecks(checks);
    store.stageProposal(proposal);
    expect(useFirebreakStore.getState().world.phase).toBe("planned");

    const authorized = store.authorizeProposal(proposal.id, 2_000);
    expect(authorized.status).toBe("authorized");
    expect(authorized.expiresAt).toBe(302_000);
    expect(useFirebreakStore.getState().world.phase).toBe("authorized");

    store.beginExecution(proposal.id);
    expect(useFirebreakStore.getState().world.phase).toBe("executing");
  });

  it("does not authorize a proposal without current passing checks", () => {
    const store = useFirebreakStore.getState();
    store.startEmergency();
    const { simulation, proposal } = plannedMission();
    store.setSimulation(simulation);
    store.stageProposal(proposal);

    expect(() => store.authorizeProposal(proposal.id, 2_000)).toThrow("passing safety checks");
  });

  it("selects robots and applies driver snapshots without losing mission state", () => {
    const store = useFirebreakStore.getState();
    store.startEmergency();
    store.selectRobot("HAUL-4");
    const driven = structuredClone(useFirebreakStore.getState().world);
    driven.robots["HAUL-4"].position.z += 1;
    driven.revision += 1;
    store.replaceWorld(driven);

    expect(useFirebreakStore.getState().world.selectedRobotId).toBe("HAUL-4");
    expect(useFirebreakStore.getState().world.robots["HAUL-4"].position.z).toBe(-7);
  });

  it("reset reproduces the seed while retaining accessibility preferences", () => {
    const store = useFirebreakStore.getState();
    store.setReducedEffects(true);
    store.startEmergency();
    store.selectRobot("MEDIC-2");

    store.resetDemo();

    expect(useFirebreakStore.getState().world).toEqual(createFirebreakSeed());
    expect(useFirebreakStore.getState().ui.reducedEffects).toBe(true);
  });
});
