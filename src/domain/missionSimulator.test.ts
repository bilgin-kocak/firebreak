import { describe, expect, it } from "vitest";

import { createFirebreakSeed, ROBOT_IDS } from "./firebreakSeed";
import {
  minimumSynchronizedSeparation,
  routeIntersectsPolygon,
  simulateCoordinatedMission,
} from "./missionSimulator";

describe("simulateCoordinatedMission", () => {
  it("produces four safe concurrent routes with bounded outcomes", () => {
    const snapshot = {
      ...createFirebreakSeed(),
      phase: "active" as const,
      hazards: { ...createFirebreakSeed().hazards, scanned: true },
    };

    const simulation = simulateCoordinatedMission(snapshot);

    expect(simulation.feasible).toBe(true);
    expect(Object.keys(simulation.routes)).toEqual(ROBOT_IDS);
    expect(simulation.durationMs).toBeLessThanOrEqual(45_000);
    expect(
      Object.values(simulation.routes).every(
        (route) => route.predictedBatteryEnd >= 20,
      ),
    ).toBe(true);
    expect(
      Object.values(simulation.routes).every(
        (route) =>
          !routeIntersectsPolygon(route, snapshot.hazards.collapseZone),
      ),
    ).toBe(true);
    expect(minimumSynchronizedSeparation(simulation.routes)).toBeGreaterThanOrEqual(
      1.25,
    );
    expect(simulation.predictions).toEqual({
      rescuedWorkers: 2,
      fireContained: true,
      containerSafe: true,
      safetyViolations: 0,
    });
  });

  it("binds the simulation to the current incident revision and state", () => {
    const snapshot = createFirebreakSeed();
    const first = simulateCoordinatedMission(snapshot);
    const repeated = simulateCoordinatedMission(snapshot);
    const revised = simulateCoordinatedMission({ ...snapshot, revision: 2 });

    expect(repeated).toEqual(first);
    expect(revised.id).not.toBe(first.id);
    expect(revised.stateHash).not.toBe(first.stateHash);
    expect(first.incidentRevision).toBe(1);
  });

  it("reports no safe route when the forbidden zone covers the warehouse", () => {
    const snapshot = createFirebreakSeed();
    snapshot.hazards.collapseZone = [
      { x: -14, z: -10 },
      { x: 14, z: -10 },
      { x: 14, z: 10 },
      { x: -14, z: 10 },
    ];

    const simulation = simulateCoordinatedMission(snapshot);

    expect(simulation.feasible).toBe(false);
    expect(simulation.reasonCode).toBe("NO_SAFE_ROUTE");
  });
});
