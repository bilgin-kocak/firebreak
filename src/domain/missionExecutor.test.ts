import { describe, expect, it, vi } from "vitest";

import type { MissionRobotDriver } from "../control/controlTypes";
import { createFirebreakSeed } from "./firebreakSeed";
import { executeMission } from "./missionExecutor";
import { simulateCoordinatedMission } from "./missionSimulator";
import { compileMissionProposal, validateSafetyEnvelope } from "./safetyCompiler";

function authorizedProposal(now = 1_000) {
  const snapshot = createFirebreakSeed();
  const simulation = simulateCoordinatedMission(snapshot);
  const report = validateSafetyEnvelope(snapshot, simulation);
  return {
    snapshot,
    proposal: {
      ...compileMissionProposal(snapshot, simulation, report, now),
      status: "authorized" as const,
      authorizedAt: now,
      expiresAt: now + 300_000,
    },
  };
}

function successfulDriver(): MissionRobotDriver {
  return {
    mode: "browser",
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    commandManual: vi.fn(async () => undefined),
    stopAll: vi.fn(async () => undefined),
    executeRoute: vi.fn(async (route, options) => {
      options.onProgress({
        robotId: route.robotId,
        progress: 0.5,
        status: "enroute",
        message: `${route.robotId} halfway`,
      });
      if (options.signal.aborted) throw options.signal.reason;
      options.onProgress({
        robotId: route.robotId,
        progress: 1,
        status: "complete",
        message: `${route.robotId} complete`,
      });
    }),
  };
}

describe("executeMission", () => {
  it("coordinates all robots and returns a truthful success receipt", async () => {
    const { snapshot, proposal } = authorizedProposal();
    const progress: string[] = [];
    const driver = successfulDriver();

    const result = await executeMission({
      snapshot,
      proposal,
      driver,
      signal: new AbortController().signal,
      now: () => 10_000,
      onProgress: (event) => progress.push(event.robotId),
    });

    expect(result.outcome).toBe("succeeded");
    expect(new Set(progress)).toEqual(new Set(Object.keys(snapshot.robots)));
    expect(result.snapshot.phase).toBe("resolved");
    expect(Object.values(result.snapshot.workers).every((worker) => worker.status === "safe")).toBe(
      true,
    );
    expect(result.snapshot.hazards.fire.contained).toBe(true);
    expect(result.snapshot.hazards.container.status).toBe("safe");
    expect(result.receipt).toMatchObject({
      outcome: "succeeded",
      rescuedWorkers: 2,
      fireContained: true,
      containerSafe: true,
      safetyViolations: 0,
    });
  });

  it("stops and restores the browser snapshot when cancelled midway", async () => {
    const { snapshot, proposal } = authorizedProposal();
    const controller = new AbortController();
    const driver = successfulDriver();

    const result = await executeMission({
      snapshot,
      proposal,
      driver,
      signal: controller.signal,
      now: () => 5_000,
      onProgress: () => controller.abort(new Error("Operator stop")),
    });

    expect(result.outcome).toBe("cancelled");
    expect(driver.stopAll).toHaveBeenCalledTimes(1);
    expect(result.snapshot.phase).toBe(snapshot.phase);
    expect(result.snapshot.robots).toEqual(snapshot.robots);
    expect(result.receipt.reason).toContain("Operator stop");
  });

  it("records driver failure without claiming mission success", async () => {
    const { snapshot, proposal } = authorizedProposal();
    const driver = successfulDriver();
    driver.executeRoute = vi.fn(async (route) => {
      if (route.robotId === "SUPPRESS-3") throw new Error("Pump offline");
    });

    const result = await executeMission({
      snapshot,
      proposal,
      driver,
      signal: new AbortController().signal,
      now: () => 5_000,
      onProgress: () => undefined,
    });

    expect(result.outcome).toBe("failed");
    expect(driver.stopAll).toHaveBeenCalledTimes(1);
    expect(result.snapshot.phase).toBe(snapshot.phase);
    expect(result.receipt.reason).toContain("Pump offline");
  });

  it("aborts and awaits sibling routes before finalizing a driver failure", async () => {
    const { snapshot, proposal } = authorizedProposal();
    const driver = successfulDriver();
    const stoppedRoutes: string[] = [];
    driver.executeRoute = vi.fn(async (route, options) => {
      if (route.robotId === "SUPPRESS-3") throw new Error("Pump offline");
      await new Promise<void>((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => {
            stoppedRoutes.push(route.robotId);
            reject(options.signal.reason);
          },
          { once: true },
        );
      });
    });

    const result = await executeMission({
      snapshot,
      proposal,
      driver,
      signal: new AbortController().signal,
      now: () => 5_000,
      onProgress: () => undefined,
    });

    expect(result.outcome).toBe("failed");
    expect(new Set(stoppedRoutes)).toEqual(new Set(["SCOUT-1", "MEDIC-2", "HAUL-4"]));
    expect(driver.stopAll).toHaveBeenCalledTimes(1);
  });

  it("rejects simultaneous use of the same one-use proposal", async () => {
    const { snapshot, proposal } = authorizedProposal();
    let release: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const driver = successfulDriver();
    driver.executeRoute = vi.fn(async () => blocker);
    const first = executeMission({
      snapshot,
      proposal,
      driver,
      signal: new AbortController().signal,
      now: () => 5_000,
      onProgress: () => undefined,
    });

    await expect(
      executeMission({
        snapshot,
        proposal,
        driver,
        signal: new AbortController().signal,
        now: () => 5_000,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow("already executing");

    release?.();
    await first;
  });

  it("stops a mission that exceeds the 45-second execution deadline", async () => {
    vi.useFakeTimers();
    try {
      const { snapshot, proposal } = authorizedProposal();
      const driver = successfulDriver();
      driver.executeRoute = vi.fn(
        async (_route, options) =>
          new Promise<void>((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason), {
              once: true,
            });
          }),
      );
      const execution = executeMission({
        snapshot,
        proposal,
        driver,
        signal: new AbortController().signal,
        now: () => 5_000,
        onProgress: () => undefined,
        executionLimitMs: 45_000,
      });

      await vi.advanceTimersByTimeAsync(45_001);
      const result = await execution;

      expect(result.outcome).toBe("cancelled");
      expect(result.receipt.reason).toContain("45-second execution limit");
      expect(driver.stopAll).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
