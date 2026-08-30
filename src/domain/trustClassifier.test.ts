import { describe, expect, it } from "vitest";

import { createInitialIncidentState } from "./incidentSeed";
import { classifyEvidence } from "./trustClassifier";

describe("classifyEvidence", () => {
  it("quarantines the canonical third-party instruction instead of trusting it for action", () => {
    const entry = createInitialIncidentState().telemetry.find(
      (item) => item.id === "log-third-party-injection",
    )!;

    expect(classifyEvidence(entry)).toEqual({
      evidenceId: "log-third-party-injection",
      trustedForAction: false,
      injectionRisk: true,
      reason:
        "Third-party content contains an instruction-like request for a forbidden capability.",
    });
  });

  it("keeps ordinary third-party text untrusted without claiming it is an attack", () => {
    const entry = {
      ...createInitialIncidentState().telemetry[0]!,
      id: "partner-status",
      provenance: "third_party" as const,
      trust: "untrusted" as const,
      content: "Payment partner reports elevated response time in eu-west.",
    };

    expect(classifyEvidence(entry)).toEqual({
      evidenceId: "partner-status",
      trustedForAction: false,
      injectionRisk: false,
      reason: "Third-party content is context only and cannot authorize an action.",
    });
  });

  it("allows platform metrics to support a response decision", () => {
    const entry = createInitialIncidentState().telemetry.find(
      (item) => item.id === "metric-error-spike",
    )!;

    expect(classifyEvidence(entry)).toMatchObject({
      evidenceId: "metric-error-spike",
      trustedForAction: true,
      injectionRisk: false,
    });
  });
});
