import {
  Color3,
  MeshBuilder,
  Vector3,
  type Engine,
  type Scene,
  type TargetCamera,
  type TransformNode,
} from "@babylonjs/core";

import { ROBOT_IDS } from "../domain/firebreakSeed";
import type {
  FirebreakSnapshot,
  RobotId,
  WorkerId,
} from "../domain/firebreakTypes";
import type { PersistedUiState } from "../store/firebreakPersistence";
import type { RobotMeshHandle } from "./createRobotMesh";

export interface WarehouseSceneHandle {
  engine: Engine;
  scene: Scene;
  camera: TargetCamera;
  robots: Map<RobotId, RobotMeshHandle>;
  workers: Map<WorkerId, TransformNode>;
  container: TransformNode;
  fireRoot: TransformNode;
  smokeRoot: TransformNode;
  routeRoot: TransformNode;
  renderLoop: () => void;
}

export interface SceneSynchronizer {
  applySnapshot(snapshot: FirebreakSnapshot): void;
  setCameraMode(mode: PersistedUiState["cameraMode"]): void;
  setSelectedRobot(robotId: RobotId): void;
  setReducedEffects(reduced: boolean): void;
  resize(): void;
  dispose(): void;
}

export function createSceneSynchronizer(handle: WarehouseSceneHandle): SceneSynchronizer {
  let selectedRobot: RobotId = "SCOUT-1";
  let cameraMode: PersistedUiState["cameraMode"] = "overview";
  let reducedEffects = false;

  function clearRoutes(): void {
    for (const mesh of handle.routeRoot.getChildMeshes()) mesh.dispose();
  }

  function updateCamera(): void {
    handle.camera.lockedTarget =
      cameraMode === "follow" ? handle.robots.get(selectedRobot)?.root ?? null : null;
  }

  return {
    applySnapshot(snapshot) {
      selectedRobot = snapshot.selectedRobotId;
      for (const robotId of ROBOT_IDS) {
        const robot = snapshot.robots[robotId];
        const mesh = handle.robots.get(robotId);
        if (!mesh) continue;
        mesh.root.position.set(robot.position.x, robot.position.y, robot.position.z);
        mesh.root.rotation.y = robot.heading;
        mesh.selectionRing.setEnabled(robotId === snapshot.selectedRobotId);
        for (const part of mesh.animatedParts) {
          part.rotation.y = reducedEffects ? 0 : snapshot.elapsedMs * 0.01;
        }
      }
      for (const [workerId, worker] of Object.entries(snapshot.workers) as Array<
        [WorkerId, FirebreakSnapshot["workers"][WorkerId]]
      >) {
        const mesh = handle.workers.get(workerId);
        if (!mesh) continue;
        mesh.position.set(worker.position.x, worker.position.y, worker.position.z);
        mesh.setEnabled(worker.status !== "safe");
      }
      handle.container.position.set(
        snapshot.hazards.container.position.x,
        snapshot.hazards.container.position.y,
        snapshot.hazards.container.position.z,
      );
      const fireScale = Math.max(0.08, snapshot.hazards.fire.intensity);
      handle.fireRoot.scaling.setAll(fireScale);
      handle.fireRoot.setEnabled(!snapshot.hazards.fire.contained || fireScale > 0.1);
      handle.smokeRoot.scaling.setAll(Math.max(0.1, snapshot.hazards.smoke));
      handle.smokeRoot.setEnabled(snapshot.hazards.smoke > 0.1 && !reducedEffects);

      clearRoutes();
      for (const robotId of ROBOT_IDS) {
        const route = snapshot.routes[robotId];
        if (route.length < 2) continue;
        const line = MeshBuilder.CreateLines(
          `${robotId}-approved-route`,
          {
            points: route.map((point) => new Vector3(point.x, point.y + 0.14, point.z)),
            updatable: false,
          },
          handle.scene,
        );
        line.color = Color3.FromHexString(snapshot.robots[robotId].color);
        line.alpha = 0.92;
        line.isPickable = false;
        line.parent = handle.routeRoot;
      }
      updateCamera();
    },
    setCameraMode(mode) {
      cameraMode = mode;
      updateCamera();
    },
    setSelectedRobot(robotId) {
      selectedRobot = robotId;
      for (const [id, robot] of handle.robots) {
        robot.selectionRing.setEnabled(id === robotId);
      }
      updateCamera();
    },
    setReducedEffects(reduced) {
      reducedEffects = reduced;
      if (reduced) handle.smokeRoot.setEnabled(false);
    },
    resize() {
      handle.engine.resize();
    },
    dispose() {
      clearRoutes();
    },
  };
}
