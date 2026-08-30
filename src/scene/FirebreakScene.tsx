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
      })
      .catch(() => {
        if (active) setGraphicsError(true);
      });
    const onResize = () => synchronizerRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
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
  return (
    <section className="firebreak-scene" aria-label="Warehouse rescue simulation">
      <canvas
        ref={canvasRef}
        className="firebreak-canvas"
        role="img"
        aria-label="Interactive warehouse rescue scene with four emergency robots"
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
          {Object.values(world.workers).map((worker) => (
            <li key={worker.id}>
              {worker.label} — {worker.status}
            </li>
          ))}
        </ul>
        <p>
          Selected robot: {world.selectedRobotId}. Emergency phase: {world.phase}.
        </p>
      </div>
    </section>
  );
}
