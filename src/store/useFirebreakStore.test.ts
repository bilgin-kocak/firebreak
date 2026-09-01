import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFirebreakSeed } from "../domain/firebreakSeed";
import { simulateCoordinatedMission } from "../domain/missionSimulator";
import { compileMissionProposal, validateSafetyEnvelope } from "../domain/safetyCompiler";
import { useFirebreakStore } from "./useFirebreakStore";
import type { PersistenceStorage } from "./firebreakPersistence";

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

  it("keeps partial execution transient so reload recovers the pre-run authority boundary", () => {
    const values = new Map<string, string>();
    const storage: PersistenceStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: vi.fn((key, value) => values.set(key, value)),
      removeItem: vi.fn((key) => values.delete(key)),
    };
    const store = useFirebreakStore.getState();
    store.setPersistenceStorage(storage);
    store.resetDemo();
    store.startEmergency();
    const { simulation, checks, proposal } = plannedMission();
    store.setSimulation(simulation);
    store.setChecks(checks);
    store.stageProposal(proposal);
    store.authorizeProposal(proposal.id, 2_000);
    store.markProposalRegistered(proposal.id);
    const writesBeforeExecution = vi.mocked(storage.setItem).mock.calls.length;

    store.beginExecution(proposal.id);
    store.applyProgress({
      robotId: "MEDIC-2",
      progress: 0.5,
      status: "enroute",
      message: "MEDIC-2 halfway",
    });
    const partial = structuredClone(useFirebreakStore.getState().world);
    partial.robots["MEDIC-2"].position.z = 0;
    partial.revision += 1;
    store.replaceWorld(partial);
    store.advanceClock(250);

    expect(vi.mocked(storage.setItem)).toHaveBeenCalledTimes(writesBeforeExecution);
    expect(JSON.parse(values.get("firebreak.world.v1")!)).toMatchObject({
      data: { phase: "authorized", robots: { "MEDIC-2": { position: { z: -8 } } } },
    });
  });

  it("advances the emergency clock independently and fails closed at 90 seconds", () => {
    const store = useFirebreakStore.getState();
    store.startEmergency();
    store.recordToolCall();

    expect(store.advanceClock(89_500)).toBe(false);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(1_000);
    for (let index = 0; index < 89; index += 1) {
      useFirebreakStore.getState().advanceClock(1_000);
    }

    const failed = useFirebreakStore.getState();
    expect(failed.world.elapsedMs).toBe(90_000);
    expect(failed.world.phase).toBe("failed");
    expect(Object.values(failed.world.robots).every((robot) => robot.status === "stopped")).toBe(
      true,
    );
    expect(failed.world.events.at(-1)?.message).toMatch(/90-second rescue window expired/i);
  });

  it("pauses the mission clock for cold start and human handoffs", () => {
    const store = useFirebreakStore.getState();
    store.startEmergency();

    store.advanceClock(1_000);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(0);

    store.recordToolCall();
    store.advanceClock(1_000);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(1_000);

    const { simulation, checks, proposal } = plannedMission();
    store.setSimulation(simulation);
    store.setChecks(checks);
    store.stageProposal(proposal);
    store.advanceClock(1_000);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(1_000);

    store.authorizeProposal(proposal.id, 2_000);
    store.advanceClock(1_000);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(1_000);

    store.beginExecution(proposal.id);
    store.advanceClock(1_000);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(2_000);
  });

  it("does not start a mission clock from a rejected pre-start tool call", () => {
    const store = useFirebreakStore.getState();
    store.recordToolCall();
    store.startEmergency();

    store.advanceClock(1_000);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(0);

    store.recordToolCall();
    store.advanceClock(1_000);
    expect(useFirebreakStore.getState().world.elapsedMs).toBe(1_000);
  });

  it("bounds the transient trace without evicting an active call and clears it on reset", () => {
    const store = useFirebreakStore.getState();
    store.recordWebMCPTrace({
      id: "active",
      kind: "tool",
      name: "inspect_emergency",
      status: "running",
      at: 1,
    });
    for (let index = 0; index < 16; index += 1) {
      useFirebreakStore.getState().recordWebMCPTrace({
        id: `complete-${index}`,
        kind: "tool",
        name: "inspect_emergency",
        status: "succeeded",
        at: index + 2,
      });
    }

    expect(useFirebreakStore.getState().webmcp.trace).toHaveLength(16);
    expect(useFirebreakStore.getState().webmcp.trace.some((entry) => entry.id === "active")).toBe(
      true,
    );

    useFirebreakStore.getState().updateWebMCPTrace("active", { status: "succeeded" });
    expect(
      useFirebreakStore.getState().webmcp.trace.find((entry) => entry.id === "active")?.status,
    ).toBe("succeeded");

    useFirebreakStore.getState().resetDemo();
    expect(useFirebreakStore.getState().webmcp.trace).toEqual([]);
  });
});
