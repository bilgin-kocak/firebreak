import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";

import { createFirebreakSeed, ROBOT_IDS } from "../domain/firebreakSeed";
import type { RobotId } from "../domain/firebreakTypes";
import type { RobotMeshHandle } from "./createRobotMesh";
import { createSceneSynchronizer, type WarehouseSceneHandle } from "./sceneSynchronizer";

function fakeHandle(): WarehouseSceneHandle {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 10, -20), scene);
  const robots = new Map<RobotId, RobotMeshHandle>();
  for (const id of ROBOT_IDS) {
    const root = new TransformNode(id, scene);
    const selectionRing = new TransformNode(`${id}-ring`, scene);
    selectionRing.setEnabled(false);
    robots.set(id, { root, selectionRing, animatedParts: [] });
  }
  const workerA = new TransformNode("WORKER-A", scene);
  const workerB = new TransformNode("WORKER-B", scene);
  const container = new TransformNode("container", scene);
  const fireRoot = new TransformNode("fire", scene);
  return {
    engine,
    scene,
    camera,
    robots,
    workers: new Map([
      ["WORKER-A", workerA],
      ["WORKER-B", workerB],
    ]),
    container,
    fireRoot,
    smokeRoot: new TransformNode("smoke", scene),
    routeRoot: new TransformNode("routes", scene),
    renderLoop: () => undefined,
  };
}

describe("scene synchronizer", () => {
  it("projects deterministic state into robot, worker, hazard, route, and selection meshes", () => {
    const handle = fakeHandle();
    const synchronizer = createSceneSynchronizer(handle);
    const snapshot = createFirebreakSeed();
    snapshot.selectedRobotId = "MEDIC-2";
    snapshot.robots["MEDIC-2"].position = { x: 3, y: 0.45, z: 4 };
    snapshot.workers["WORKER-A"].status = "safe";
    snapshot.hazards.fire.intensity = 0.2;
    snapshot.routes["MEDIC-2"] = [
      { x: -6, y: 0.45, z: -8 },
      { x: 3, y: 0.45, z: 4 },
    ];

    synchronizer.applySnapshot(snapshot);

    expect(handle.robots.get("MEDIC-2")?.root.position.asArray()).toEqual([3, 0.45, 4]);
    expect(handle.robots.get("MEDIC-2")?.selectionRing.isEnabled()).toBe(true);
    expect(handle.robots.get("SCOUT-1")?.selectionRing.isEnabled()).toBe(false);
    expect(handle.workers.get("WORKER-A")?.isEnabled()).toBe(false);
    expect(handle.fireRoot.scaling.x).toBeCloseTo(0.2);
    expect(handle.routeRoot.getChildMeshes()).toHaveLength(1);

    synchronizer.dispose();
    expect(handle.scene.isDisposed).toBe(false);
    handle.scene.dispose();
    handle.engine.dispose();
  });

  it("changes camera target without recreating the scene", () => {
    const handle = fakeHandle();
    const synchronizer = createSceneSynchronizer(handle);
    synchronizer.setCameraMode("follow");
    synchronizer.setSelectedRobot("HAUL-4");
    synchronizer.setReducedEffects(true);

    expect(handle.camera.lockedTarget).toBe(handle.robots.get("HAUL-4")?.root);
    synchronizer.dispose();
    handle.scene.dispose();
    handle.engine.dispose();
  });
});
