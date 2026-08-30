import { describe, expect, it } from "vitest";

import { createFirebreakSeed } from "../domain/firebreakSeed";
import type { FirebreakSnapshot } from "../domain/firebreakTypes";
import { simulateCoordinatedMission } from "../domain/missionSimulator";
import { BrowserSimulationDriver } from "./browserSimulationDriver";

function activeSeed(): FirebreakSnapshot {
  return { ...createFirebreakSeed(), phase: "active" };
}

describe("BrowserSimulationDriver", () => {
  it("moves only the commanded robot and consumes bounded battery", async () => {
    let snapshot = activeSeed();
    const before = structuredClone(snapshot);
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
      },
    });

    await driver.commandManual({
      robotId: "SCOUT-1",
      throttle: 1,
      turn: 0,
      action: false,
      deltaMs: 1_000,
    });

    expect(snapshot.robots["SCOUT-1"].position.z).toBeGreaterThan(
      before.robots["SCOUT-1"].position.z,
    );
    expect(snapshot.robots["SCOUT-1"].battery).toBeLessThan(100);
    expect(snapshot.robots["MEDIC-2"]).toEqual(before.robots["MEDIC-2"]);
    expect(snapshot.robots["SUPPRESS-3"]).toEqual(before.robots["SUPPRESS-3"]);
    expect(snapshot.robots["HAUL-4"]).toEqual(before.robots["HAUL-4"]);
  });

  it("refuses movement into the collapse zone", async () => {
    let snapshot = activeSeed();
    snapshot = {
      ...snapshot,
      robots: {
        ...snapshot.robots,
        "MEDIC-2": {
          ...snapshot.robots["MEDIC-2"],
          position: { x: 2, y: 0.45, z: -6.4 },
          heading: 0,
        },
      },
    };
    const before = structuredClone(snapshot.robots["MEDIC-2"].position);
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
      },
    });

    await driver.commandManual({
      robotId: "MEDIC-2",
      throttle: 1,
      turn: 0,
      action: false,
      deltaMs: 1_000,
    });

    expect(snapshot.robots["MEDIC-2"].position).toEqual(before);
    expect(snapshot.robots["MEDIC-2"].status).toBe("stopped");
    expect(snapshot.events.at(-1)?.message).toContain("collapse zone");
  });

  it("refuses movement through a warehouse shelf", async () => {
    let snapshot = activeSeed();
    snapshot.robots["MEDIC-2"] = {
      ...snapshot.robots["MEDIC-2"],
      position: { x: -4, y: 0.45, z: -8 },
      heading: 0,
    };
    const before = structuredClone(snapshot.robots["MEDIC-2"].position);
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
      },
    });

    await driver.commandManual({
      robotId: "MEDIC-2",
      throttle: 1,
      turn: 0,
      action: false,
      deltaMs: 1_000,
    });

    expect(snapshot.robots["MEDIC-2"].position).toEqual(before);
    expect(snapshot.events.at(-1)?.message).toContain("warehouse obstacle");
  });

  it("allows only the correct nearby robot to scan hazards", async () => {
    let snapshot = activeSeed();
    snapshot = {
      ...snapshot,
      robots: {
        ...snapshot.robots,
        "SCOUT-1": {
          ...snapshot.robots["SCOUT-1"],
          position: { x: 4.5, y: 2.4, z: 3.5 },
        },
        "MEDIC-2": {
          ...snapshot.robots["MEDIC-2"],
          position: { x: 4.5, y: 0.45, z: 3.5 },
        },
      },
    };
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
      },
    });

    await driver.commandManual({
      robotId: "MEDIC-2",
      throttle: 0,
      turn: 0,
      action: true,
      deltaMs: 16,
    });
    expect(snapshot.hazards.scanned).toBe(false);

    await driver.commandManual({
      robotId: "SCOUT-1",
      throttle: 0,
      turn: 0,
      action: true,
      deltaMs: 16,
    });
    expect(snapshot.hazards.scanned).toBe(true);
    expect(snapshot.objectives.find((objective) => objective.id === "scan-hazards")?.status).toBe(
      "complete",
    );
  });

  it("lets medic and haul robots secure real payloads through contextual manual actions", async () => {
    let snapshot = activeSeed();
    snapshot.robots["MEDIC-2"] = {
      ...snapshot.robots["MEDIC-2"],
      position: { x: 10, y: 0.45, z: -0.5 },
    };
    snapshot.robots["HAUL-4"] = {
      ...snapshot.robots["HAUL-4"],
      position: { x: 8.5, y: 0.48, z: 7 },
    };
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
      },
    });

    await driver.commandManual({
      robotId: "MEDIC-2",
      throttle: 0,
      turn: 0,
      action: true,
      deltaMs: 16,
    });
    await driver.commandManual({
      robotId: "HAUL-4",
      throttle: 0,
      turn: 0,
      action: true,
      deltaMs: 16,
    });
    await driver.commandManual({
      robotId: "HAUL-4",
      throttle: 0,
      turn: 0,
      action: true,
      deltaMs: 16,
    });

    expect(snapshot.workers["WORKER-A"]).toMatchObject({
      status: "rescuing",
      assignedRobot: "MEDIC-2",
    });
    expect(snapshot.hazards.container.status).toBe("moving");
  });

  it("stops all robot movement", async () => {
    let snapshot = activeSeed();
    snapshot = {
      ...snapshot,
      robots: Object.fromEntries(
        Object.entries(snapshot.robots).map(([id, robot]) => [id, { ...robot, status: "manual" }]),
      ) as FirebreakSnapshot["robots"],
    };
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
      },
    });

    await driver.stopAll("Controller disconnected");

    expect(Object.values(snapshot.robots).every((robot) => robot.status === "stopped")).toBe(true);
    expect(snapshot.events.at(-1)?.message).toBe("All robots stopped: Controller disconnected");
  });

  it("plays an approved route through deterministic progress updates", async () => {
    let snapshot = activeSeed();
    const route = simulateCoordinatedMission(snapshot).routes["SCOUT-1"];
    const progress: number[] = [];
    const positions: number[] = [];
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
        positions.push(next.robots["SCOUT-1"].position.z);
      },
      wait: async () => undefined,
      playbackRate: 4,
    });

    await driver.executeRoute(route, {
      signal: new AbortController().signal,
      onProgress: (event) => progress.push(event.progress),
    });

    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBeGreaterThan(route.waypoints.length);
    expect(new Set(positions.map((position) => position.toFixed(2))).size).toBeGreaterThan(5);
    expect(snapshot.robots["SCOUT-1"].position).toEqual(route.waypoints.at(-1)?.position);
    expect(snapshot.robots["SCOUT-1"].battery).toBe(route.predictedBatteryEnd);
    expect(snapshot.hazards.scanned).toBe(true);
  });
});
