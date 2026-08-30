import { useEffect, useRef, useState } from "react";

import { useFirebreakStore } from "../store/useFirebreakStore";
import { createWarehouseScene } from "./createWarehouseScene";
import { createSceneSynchronizer, type SceneSynchronizer } from "./sceneSynchronizer";

export type FirebreakSceneFactory = (canvas: HTMLCanvasElement) => Promise<SceneSynchronizer>;

const defaultFactory: FirebreakSceneFactory = async (canvas) => {
  const scene = await createWarehouseScene(canvas);
  const synchronizer = createSceneSynchronizer(scene);
  const disposeSynchronizer = synchronizer.dispose.bind(synchronizer);
  synchronizer.dispose = () => {
    disposeSynchronizer();
    scene.engine.stopRenderLoop(scene.renderLoop);
    scene.scene.dispose();
    scene.engine.dispose();
  };
  return synchronizer;
};

export function FirebreakScene({ factory = defaultFactory }: { factory?: FirebreakSceneFactory }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const synchronizerRef = useRef<SceneSynchronizer | null>(null);
  const [graphicsError, setGraphicsError] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const world = useFirebreakStore((state) => state.world);
  const cameraMode = useFirebreakStore((state) => state.ui.cameraMode);
  const reducedEffects = useFirebreakStore((state) => state.ui.reducedEffects);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let created: SceneSynchronizer | null = null;
    void factory(canvas)
      .then((synchronizer) => {
        created = synchronizer;
        if (!active) {
          synchronizer.dispose();
          return;
        }
        synchronizerRef.current = synchronizer;
        synchronizer.applySnapshot(useFirebreakStore.getState().world);
        synchronizer.setCameraMode(useFirebreakStore.getState().ui.cameraMode);
        synchronizer.setReducedEffects(useFirebreakStore.getState().ui.reducedEffects);
        setSceneReady(true);
      })
      .catch(() => {
        if (active) setGraphicsError(true);
      });
    const onResize = () => synchronizerRef.current?.resize();
    const onCameraInput = (event: Event) => {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail;
      synchronizerRef.current?.adjustCamera(Number(detail?.x ?? 0), Number(detail?.y ?? 0));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("firebreak:camera-input", onCameraInput);
    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("firebreak:camera-input", onCameraInput);
      created?.dispose();
      synchronizerRef.current = null;
    };
  }, [factory]);

  useEffect(() => {
    synchronizerRef.current?.applySnapshot(world);
  }, [world]);
  useEffect(() => {
    synchronizerRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);
  useEffect(() => {
    synchronizerRef.current?.setSelectedRobot(world.selectedRobotId);
  }, [world.selectedRobotId]);
  useEffect(() => {
    synchronizerRef.current?.setReducedEffects(reducedEffects);
  }, [reducedEffects]);

  const trapped = Object.values(world.workers).filter((worker) => worker.status !== "safe").length;
  const remainingSeconds = Math.max(
    0,
    Math.ceil((world.durationLimitMs - world.elapsedMs) / 1_000),
  );
  return (
    <section className="firebreak-scene" aria-label="Warehouse rescue simulation">
      <canvas
        ref={canvasRef}
        className="firebreak-canvas"
        role="img"
        aria-label="Interactive warehouse rescue scene with four emergency robots"
        data-scene-ready={sceneReady || graphicsError}
      />
      {graphicsError ? (
        <p className="graphics-fallback">
          3D graphics are unavailable; mission controls still work.
        </p>
      ) : null}
      <div className="scene-vignette" aria-hidden="true" />
      <div className="sr-only scene-summary" role="status" aria-label="Scene status">
        <p>
          Four robots ready. {trapped} workers need rescue. Battery Bay B fire is{" "}
          {world.hazards.fire.contained ? "contained" : "active"}.
        </p>
        <ul>
          {Object.values(world.robots).map((robot) => (
            <li key={robot.id}>
              {robot.id}, {robot.role}, battery {Math.round(robot.battery)} percent, status{" "}
              {robot.status}, position {robot.position.x.toFixed(1)}, {robot.position.z.toFixed(1)},
              route {Math.round(robot.routeProgress * 100)} percent.
            </li>
          ))}
          {Object.values(world.workers).map((worker) => (
            <li key={worker.id}>
              {worker.label} — {worker.status}
            </li>
          ))}
        </ul>
        <p>
          Selected robot: {world.selectedRobotId}. Emergency phase: {world.phase}. Mission time{" "}
          remaining: {remainingSeconds} seconds. Hazardous container:{" "}
          {world.hazards.container.status}. Power:{" "}
          {world.hazards.powerIsolated ? "isolated" : "live"}. Approved routes:{" "}
          {Object.values(world.routes).filter((route) => route.length > 1).length} of 4.
        </p>
        <ul>
          {world.objectives.map((objective) => (
            <li key={objective.id}>
              Objective {objective.label}: {objective.status}.
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
