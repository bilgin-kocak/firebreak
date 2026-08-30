import type { EvidenceAssessment, TelemetryEntry } from "./airlockTypes";

const instructionLikePattern = /(?:system\s+override|ignore\s+the\s+incident|call\s+export_customer_data)/i;
const forbiddenCapabilityPattern =
  /(?:export_customer_data|delete_(?:customer|order|record)|read_(?:secret|env)|change_(?:payments|inventory))/i;

export const classifyEvidence = (entry: TelemetryEntry): EvidenceAssessment => {
  if (entry.provenance !== "third_party" && entry.trust === "trusted") {
    return {
      evidenceId: entry.id,
      trustedForAction: true,
      injectionRisk: false,
      reason: "Platform-owned evidence may support a response decision.",
    };
  }

  const injectionRisk =
    entry.injectionFixture ||
    (instructionLikePattern.test(entry.content) && forbiddenCapabilityPattern.test(entry.content));
  return {
    evidenceId: entry.id,
    trustedForAction: false,
    injectionRisk,
    reason: injectionRisk
      ? "Third-party content contains an instruction-like request for a forbidden capability."
      : "Third-party content is context only and cannot authorize an action.",
  };
};
