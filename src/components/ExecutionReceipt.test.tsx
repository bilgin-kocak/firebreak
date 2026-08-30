import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ExecutionReceipt as Receipt } from "../domain/airlockTypes";
import { ExecutionReceipt } from "./ExecutionReceipt";

const receipt = (status: Receipt["status"]): Receipt => ({
  id: `receipt-${status}`,
  incidentId: "INC-4821",
  toolName: "rollback_checkout_release",
  status,
  canaryPercent: 10,
  fromRelease: "2026.08.30.3",
  toRelease: "2026.08.30.2",
  finalErrorRate: status === "incident_resolved" ? 0.6 : 31.8,
  finalP95LatencyMs: status === "incident_resolved" ? 420 : 4820,
  productionMutations: status === "incident_resolved" ? 1 : 0,
  blockedEvidenceIds: ["log-third-party-injection"],
  operationIds: [],
  startedAt: "2026-08-30T09:03:00.000Z",
  completedAt: "2026-08-30T09:03:01.000Z",
});

describe("ExecutionReceipt", () => {
  it.each([
    ["incident_resolved", "Checkout recovered", "2026.08.30.3 → 2026.08.30.2"],
    ["failed", "Recovery failed", "2026.08.30.3 retained · 2026.08.30.2 not promoted"],
    ["cancelled", "Recovery cancelled", "2026.08.30.3 retained · 2026.08.30.2 not promoted"],
  ] as const)("renders the %s receipt truthfully", (status, heading, releaseText) => {
    render(<ExecutionReceipt receipt={receipt(status)} />);

    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByText(releaseText)).toBeVisible();
  });
});
