import { describe, expect, it } from "vitest";

import {
  COLLAPSE_ZONE,
  INCIDENT_ID,
  ROBOT_IDS,
  SAFE_ZONE,
  createFirebreakSeed,
} from "./firebreakSeed";
import { FirebreakSnapshotSchema } from "./firebreakSchemas";

describe("createFirebreakSeed", () => {
  it("creates the complete deterministic warehouse emergency", () => {
    const seed = createFirebreakSeed();

    expect(seed.incidentId).toBe(INCIDENT_ID);
    expect(seed.incidentId).toBe("WH-01");
    expect(Object.keys(seed.robots)).toEqual(ROBOT_IDS);
    expect(Object.values(seed.workers)).toHaveLength(2);
    expect(seed.hazards.collapseZone).toEqual(COLLAPSE_ZONE);
    expect(seed.safeZone).toEqual(SAFE_ZONE);
    expect(seed.objectives.map((objective) => objective.status)).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    expect(seed.phase).toBe("ready");
    expect(seed.revision).toBe(1);
    expect(FirebreakSnapshotSchema.parse(seed)).toEqual(seed);
    expect(createFirebreakSeed()).toEqual(seed);
  });

  it("starts four healthy role-specific robots", () => {
    const seed = createFirebreakSeed();

    expect(Object.values(seed.robots).map((robot) => robot.role)).toEqual([
      "scout",
      "rescue",
      "suppress",
      "haul",
    ]);
    expect(Object.values(seed.robots).map((robot) => robot.battery)).toEqual([100, 100, 100, 100]);
    expect(
      new Set(
        Object.values(seed.robots).map(
          (robot) => `${robot.position.x}:${robot.position.y}:${robot.position.z}`,
        ),
      ).size,
    ).toBe(4);
  });

  it("rejects malformed or expanded snapshots", () => {
    const seed = createFirebreakSeed();

    expect(() =>
      FirebreakSnapshotSchema.parse({
        ...seed,
        robots: {
          ...seed.robots,
          "SCOUT-1": { ...seed.robots["SCOUT-1"], role: "police" },
        },
      }),
    ).toThrow();
    expect(() =>
      FirebreakSnapshotSchema.parse({
        ...seed,
        robots: {
          ...seed.robots,
          "MEDIC-2": { ...seed.robots["MEDIC-2"], battery: 101 },
        },
      }),
    ).toThrow();
    expect(() =>
      FirebreakSnapshotSchema.parse({
        ...seed,
        robots: {
          ...seed.robots,
          "HAUL-4": {
            ...seed.robots["HAUL-4"],
            position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
          },
        },
      }),
    ).toThrow();
    expect(() =>
      FirebreakSnapshotSchema.parse({
        ...seed,
        objectives: [...seed.objectives, seed.objectives[0]],
      }),
    ).toThrow();
    expect(() => FirebreakSnapshotSchema.parse({ ...seed, unexpectedAuthority: true })).toThrow();
  });
});
