import type { AppState } from "./useAppStore";

export const selectIncidentState = (state: AppState) => state.incidentState;
export const selectIncident = (state: AppState) => state.incidentState.incident;
export const selectServices = (state: AppState) => state.incidentState.services;
export const selectTelemetry = (state: AppState) => state.incidentState.telemetry;
export const selectActivity = (state: AppState) => state.activity;
export const selectOrderedActivity = (state: AppState) =>
  state.rightRail.chronological ? [...state.activity].reverse() : state.activity;
export const selectApprovedResponseTools = (state: AppState) => state.approvedResponseTools;
export const selectWebMCPMetadata = (state: AppState) => state.webmcp;
export const selectCurrentSimulation = (state: AppState) =>
  Object.values(state.simulations).find(
    (simulation) => simulation.incidentRevision === state.incidentState.incident.revision,
  );
export const selectCurrentProposal = (state: AppState) =>
  Object.values(state.proposals).find(
    (proposal) => proposal.incidentRevision === state.incidentState.incident.revision,
  );
