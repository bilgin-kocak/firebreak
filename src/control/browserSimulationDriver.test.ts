import { describe, expect, it } from "vitest";

import { createFirebreakSeed } from "../domain/firebreakSeed";
import type { FirebreakSnapshot } from "../domain/firebreakTypes";
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
      robotId: "MEDIC-2",
      throttle: 1,
      turn: 0,
      action: false,
      deltaMs: 1_000,
    });

    expect(snapshot.robots["MEDIC-2"].position.z).toBeGreaterThan(
      before.robots["MEDIC-2"].position.z,
    );
    expect(snapshot.robots["MEDIC-2"].battery).toBeLessThan(100);
    expect(snapshot.robots["SCOUT-1"]).toEqual(before.robots["SCOUT-1"]);
    expect(snapshot.robots["SUPPRESS-3"]).toEqual(
      before.robots["SUPPRESS-3"],
    );
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
    expect(
      snapshot.objectives.find((objective) => objective.id === "scan-hazards")
        ?.status,
    ).toBe("complete");
  });

  it("stops all robot movement", async () => {
    let snapshot = activeSeed();
    snapshot = {
      ...snapshot,
      robots: Object.fromEntries(
        Object.entries(snapshot.robots).map(([id, robot]) => [
          id,
          { ...robot, status: "manual" },
        ]),
      ) as FirebreakSnapshot["robots"],
    };
    const driver = new BrowserSimulationDriver({
      readSnapshot: () => snapshot,
      commitSnapshot: (next) => {
        snapshot = next;
      },
    });

    await driver.stopAll("Controller disconnected");

    expect(Object.values(snapshot.robots).every((robot) => robot.status === "stopped")).toBe(
      true,
    );
    expect(snapshot.events.at(-1)?.message).toBe(
      "All robots stopped: Controller disconnected",
    );
  });
});
