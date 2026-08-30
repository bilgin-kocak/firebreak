import { z } from "zod";

export const serviceIdSchema = z.enum([
  "storefront",
  "checkout-api",
  "payments",
  "orders",
  "inventory",
]);

export const incidentPolicySchema = z.object({
  incidentId: z.literal("INC-4821"),
  serviceIds: z.tuple([z.literal("checkout-api")]),
  allowedOperationIds: z.array(z.string().min(1)).min(1).max(8),
  forbiddenCapabilities: z.tuple([
    z.literal("customer_data_export"),
    z.literal("record_deletion"),
    z.literal("secret_access"),
    z.literal("unrelated_service_change"),
  ]),
  maxProductionMutations: z.literal(1),
  simulationRevision: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  oneUse: z.literal(true),
  used: z.boolean(),
});

export const incidentStateSchema = z.object({
  incident: z.object({
    id: z.literal("INC-4821"),
    title: z.string().min(1),
    severity: z.literal("SEV-1"),
    status: z.enum(["active", "recovering", "resolved"]),
    startedAt: z.string().datetime(),
    resolvedAt: z.string().datetime().optional(),
    revision: z.number().int().positive(),
    errorRate: z.number().nonnegative(),
    p95LatencyMs: z.number().nonnegative(),
    affectedServiceIds: z.array(serviceIdSchema),
  }),
  services: z.array(
    z.object({
      id: serviceIdSchema,
      name: z.string().min(1),
      kind: z.enum(["edge", "service", "dependency", "data"]),
      status: z.enum(["healthy", "degraded", "critical", "recovering"]),
      version: z.string().min(1),
      errorRate: z.number().nonnegative(),
      p95LatencyMs: z.number().nonnegative(),
    }),
  ),
  edges: z.array(
    z.object({
      from: serviceIdSchema,
      to: serviceIdSchema,
      status: z.enum(["normal", "saturated", "blocked", "canary"]),
      requestsPerMinute: z.number().nonnegative(),
    }),
  ),
  telemetry: z.array(
    z.object({
      id: z.string().min(1),
      timestamp: z.string().datetime(),
      serviceId: serviceIdSchema,
      channel: z.enum(["metric", "trace", "log", "deployment"]),
      provenance: z.enum(["platform", "dependency", "third_party"]),
      trust: z.enum(["trusted", "untrusted"]),
      title: z.string().min(1),
      content: z.string(),
      quarantined: z.boolean(),
      injectionFixture: z.boolean(),
    }),
  ),
  deployments: z.array(
    z.object({
      id: z.string().min(1),
      serviceId: serviceIdSchema,
      version: z.string().min(1),
      deployedAt: z.string().datetime(),
      current: z.boolean(),
      stable: z.boolean(),
      commit: z.string().min(1),
    }),
  ),
  policy: incidentPolicySchema,
});
