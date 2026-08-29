import type { AppState, RightRailTab } from "./useAppStore";

export const selectResident = (state: AppState) => state.resident;
export const selectPortalMode = (state: AppState) => state.portalMode;
export const selectCurrentService = (state: AppState) => state.currentService;
export const selectActiveView = (state: AppState) =>
  state.activeViewId ? state.views[state.activeViewId] : undefined;
export const selectActivity = (state: AppState) => state.activity;
export const selectRightRailTab = (state: AppState): RightRailTab => state.rightRail.activeTab;
export const selectApprovedWorkflowTools = (state: AppState) => state.approvedWorkflowTools;
export const selectWebMCPMetadata = (state: AppState) => state.webmcp;
