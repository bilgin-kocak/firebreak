import { describe, expect, it } from "vitest";

import { createFirebreakSeed } from "./firebreakSeed";
import {
  compileMissionProposal,
  validateSafetyEnvelope,
} from "./safetyCompiler";
import { simulateCoordinatedMission } from "./missionSimulator";

describe("Firebreak safety compiler", () => {
  it("passes a current coordinated plan and stages narrow authority", () => {
    const snapshot = createFirebreakSeed();
    const simulation = simulateCoordinatedMission(snapshot);
    const report = validateSafetyEnvelope(snapshot, simulation);

    expect(report.passed).toBe(true);
    expect(report.checks.every((check) => check.status === "passed")).toBe(true);

    const proposal = compileMissionProposal(snapshot, simulation, report, 1_000);

    expect(proposal.status).toBe("staged");
    expect(proposal.authorizedAt).toBeNull();
    expect(proposal.expiresAt).toBeNull();
    expect(proposal.oneUse).toBe(true);
    expect(proposal.allowedRobotIds).toEqual([
      "SCOUT-1",
      "MEDIC-2",
      "SUPPRESS-3",
      "HAUL-4",
    ]);
    expect(proposal.strategy).toBe("coordinated");
  });

  it.each([
    ["stale incident revision", (snapshot: ReturnType<typeof createFirebreakSeed>) => ({ ...snapshot, revision: 2 }), "revision"],
    ["low battery prediction", (snapshot: ReturnType<typeof createFirebreakSeed>) => snapshot, "battery"],
    ["overlong execution", (snapshot: ReturnType<typeof createFirebreakSeed>) => snapshot, "duration"],
    ["collapse-zone route", (snapshot: ReturnType<typeof createFirebreakSeed>) => snapshot, "geofence"],
  ] as const)("rejects %s", (_label, changeSnapshot, expectedCheck) => {
    const original = createFirebreakSeed();
    let snapshot = changeSnapshot(original);
    const simulation = simulateCoordinatedMission(original);

    if (expectedCheck === "battery") {
      simulation.routes["MEDIC-2"].predictedBatteryEnd = 19;
    }
    if (expectedCheck === "duration") {
      simulation.durationMs = 46_000;
    }
    if (expectedCheck === "geofence") {
      simulation.routes["MEDIC-2"].waypoints[1]!.position = {
        x: 2,
        y: 0.45,
        z: -4,
      };
    }

    const report = validateSafetyEnvelope(snapshot, simulation);

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === expectedCheck)?.status).toBe(
      "failed",
    );
    expect(() =>
      compileMissionProposal(snapshot, simulation, report, 1_000),
    ).toThrow();
  });
});
