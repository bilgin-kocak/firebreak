import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { Scene } from "@babylonjs/core/scene";

import { createFirebreakSeed, ROBOT_IDS } from "../domain/firebreakSeed";
import type { RobotId, WorkerId } from "../domain/firebreakTypes";
import { createRobotMesh } from "./createRobotMesh";
import type { WarehouseSceneHandle } from "./sceneSynchronizer";

function createMaterial(
  scene: Scene,
  name: string,
  color: string,
  options: { emissive?: number; alpha?: number } = {},
) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = new Color3(0.12, 0.14, 0.16);
  material.alpha = options.alpha ?? 1;
  if (options.emissive) {
    material.emissiveColor = Color3.FromHexString(color).scale(options.emissive);
  }
  return material;
}

function createShelf(
  scene: Scene,
  x: number,
  z: number,
  length: number,
  material: StandardMaterial,
  crateMaterial: StandardMaterial,
): void {
  for (const xOffset of [-length / 2, length / 2]) {
    const upright = MeshBuilder.CreateBox(
      `shelf-upright-${x}-${z}-${xOffset}`,
      { width: 0.16, height: 3.7, depth: 1.55 },
      scene,
    );
    upright.position.set(x + xOffset, 1.85, z);
    upright.material = material;
  }
  for (const level of [0.45, 1.65, 2.85]) {
    const beam = MeshBuilder.CreateBox(
      `shelf-beam-${x}-${z}-${level}`,
      { width: length, height: 0.13, depth: 1.6 },
      scene,
    );
    beam.position.set(x, level, z);
    beam.material = material;
    for (let crate = -1; crate <= 1; crate += 1) {
      const box = MeshBuilder.CreateBox(
        `crate-${x}-${z}-${level}-${crate}`,
        { width: 1.25, height: 0.72, depth: 1.12 },
        scene,
      );
      box.position.set(x + crate * 1.45, level + 0.42, z);
      box.material = crateMaterial;
    }
  }
}

function createWorker(scene: Scene, id: WorkerId, color: StandardMaterial): TransformNode {
  const root = new TransformNode(id, scene);
  const body = MeshBuilder.CreateCapsule(`${id}-body`, { height: 1.25, radius: 0.24 }, scene);
  body.position.y = 0.62;
  body.material = color;
  body.parent = root;
  const helmet = MeshBuilder.CreateSphere(`${id}-helmet`, { diameter: 0.48, segments: 10 }, scene);
  helmet.position.y = 1.25;
  helmet.material = color;
  helmet.parent = root;
  return root;
}

async function enableOptionalHavok(scene: Scene, ground: ReturnType<typeof MeshBuilder.CreateGround>) {
  try {
    const { default: HavokPhysics } = await import("@babylonjs/havok");
    const havok = await HavokPhysics();
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
    new PhysicsAggregate(
      ground,
      PhysicsShapeType.BOX,
      { mass: 0, restitution: 0.05, friction: 0.8 },
      scene,
    );
  } catch {
    // The deterministic driver still enforces bounds/geofences if WASM cannot initialize.
  }
}

export async function createWarehouseScene(
  canvas: HTMLCanvasElement,
): Promise<WarehouseSceneHandle> {
  if (!Engine.isSupported()) throw new Error("WebGL is unavailable");
  const snapshot = createFirebreakSeed();
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
  });
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString("#071019ff");
  scene.ambientColor = Color3.FromHexString("#172633");
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = Color3.FromHexString("#0d1822");
  scene.fogDensity = 0.012;

  const camera = new ArcRotateCamera(
    "tactical-camera",
    -Math.PI / 2.3,
    Math.PI / 3.2,
    28,
    new Vector3(0, 0, 0),
    scene,
  );
  camera.lowerRadiusLimit = 12;
  camera.upperRadiusLimit = 38;
  camera.lowerBetaLimit = 0.45;
  camera.upperBetaLimit = 1.42;
  camera.wheelDeltaPercentage = 0.012;
  camera.panningSensibility = 0;
  camera.attachControl(canvas, true);

  const ambient = new HemisphericLight("warehouse-ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.54;
  ambient.groundColor = Color3.FromHexString("#091018");
  const fireLight = new PointLight("fire-light", new Vector3(4.5, 2.2, 3), scene);
  fireLight.diffuse = Color3.FromHexString("#ff6538");
  fireLight.intensity = 8;
  fireLight.range = 12;
  const blueLight = new PointLight("response-light", new Vector3(-8, 4.5, -6), scene);
  blueLight.diffuse = Color3.FromHexString("#58d9f3");
  blueLight.intensity = 4.5;
  blueLight.range = 18;
  const glow = new GlowLayer("rescue-glow", scene, { blurKernelSize: 18 });
  glow.intensity = 0.42;

  const concrete = createMaterial(scene, "concrete", "#28323a");
  const steel = createMaterial(scene, "steel", "#53616b");
  const crate = createMaterial(scene, "crate", "#755b3b");
  const safety = createMaterial(scene, "safety-zone", "#c7ef5b", {
    emissive: 0.32,
    alpha: 0.32,
  });
  const danger = createMaterial(scene, "collapse-zone", "#ff4e3c", {
    emissive: 0.45,
    alpha: 0.27,
  });
  const ember = createMaterial(scene, "ember", "#ff5a36", { emissive: 0.85 });
  const smoke = createMaterial(scene, "smoke", "#6e7a82", { alpha: 0.16 });
  smoke.backFaceCulling = false;
  const workerMaterial = createMaterial(scene, "worker-suit", "#f3c851", {
    emissive: 0.12,
  });
  const hazardMaterial = createMaterial(scene, "hazard-container", "#c496ff", {
    emissive: 0.24,
  });

  const ground = MeshBuilder.CreateGround("warehouse-floor", { width: 29, height: 21 }, scene);
  ground.material = concrete;
  ground.receiveShadows = true;
  const safeZone = MeshBuilder.CreateGround("safe-zone", { width: 5, height: 4 }, scene);
  safeZone.position.set(-10.5, 0.025, 7);
  safeZone.material = safety;
  const collapseZone = MeshBuilder.CreateGround(
    "collapse-zone",
    { width: 7, height: 4, subdivisions: 8 },
    scene,
  );
  collapseZone.position.set(4.5, 0.035, -4);
  collapseZone.material = danger;

  for (const z of [-5.8, -0.6, 5.2]) {
    createShelf(scene, -4, z, 4.5, steel, crate);
  }
  for (const z of [-5.8, -0.6]) {
    createShelf(scene, 7.5, z, 4, steel, crate);
  }
  for (const [x, z, width, depth] of [
    [0, -10.25, 29, 0.25],
    [0, 10.25, 29, 0.25],
    [-14.25, 0, 0.25, 21],
    [14.25, 0, 0.25, 21],
  ] as const) {
    const wall = MeshBuilder.CreateBox(
      `warehouse-wall-${x}-${z}`,
      { width, height: 5.4, depth },
      scene,
    );
    wall.position.set(x, 2.7, z);
    wall.material = steel;
  }

  const bay = MeshBuilder.CreateBox("battery-bay-b", { width: 3.2, height: 0.35, depth: 2.5 }, scene);
  bay.position.set(4.5, 0.18, 3);
  bay.material = danger;
  const fireRoot = new TransformNode("fire-root", scene);
  fireRoot.position.copyFrom(snapshot.hazards.fire.position as Vector3);
  for (const [height, diameter, y] of [
    [1.6, 1.4, 0.8],
    [1.25, 0.95, 1.45],
    [0.8, 0.58, 2.05],
  ] as const) {
    const flame = MeshBuilder.CreateCylinder(
      `flame-${height}`,
      { height, diameterBottom: diameter, diameterTop: 0, tessellation: 10 },
      scene,
    );
    flame.position.y = y;
    flame.material = ember;
    flame.parent = fireRoot;
  }
  const smokeRoot = new TransformNode("smoke-root", scene);
  smokeRoot.position.set(4.5, 2.6, 3);
  for (let index = 0; index < 5; index += 1) {
    const puff = MeshBuilder.CreateSphere(
      `smoke-puff-${index}`,
      { diameter: 1.5 + index * 0.38, segments: 8 },
      scene,
    );
    puff.position.set((index % 2) * 0.55, index * 0.62, -index * 0.15);
    puff.material = smoke;
    puff.parent = smokeRoot;
  }

  const workers = new Map<WorkerId, TransformNode>();
  for (const [workerId, worker] of Object.entries(snapshot.workers) as Array<
    [WorkerId, (typeof snapshot.workers)[WorkerId]]
  >) {
    const root = createWorker(scene, workerId, workerMaterial);
    root.position.set(worker.position.x, worker.position.y, worker.position.z);
    workers.set(workerId, root);
  }
  const container = new TransformNode("hazard-container-root", scene);
  container.position.set(
    snapshot.hazards.container.position.x,
    snapshot.hazards.container.position.y,
    snapshot.hazards.container.position.z,
  );
  const containerBody = MeshBuilder.CreateBox(
    "hazard-container-body",
    { width: 1.65, height: 1.25, depth: 1.2 },
    scene,
  );
  containerBody.material = hazardMaterial;
  containerBody.parent = container;
  for (const x of [-0.5, 0, 0.5]) {
    const stripe = MeshBuilder.CreateBox(
      `container-stripe-${x}`,
      { width: 0.14, height: 1.29, depth: 1.23 },
      scene,
    );
    stripe.position.x = x;
    stripe.material = danger;
    stripe.parent = container;
  }

  const robots = new Map<RobotId, ReturnType<typeof createRobotMesh>>();
  for (const robotId of ROBOT_IDS) {
    robots.set(robotId, createRobotMesh(scene, snapshot.robots[robotId]));
  }
  const routeRoot = new TransformNode("approved-routes", scene);

  let renderTime = 0;
  const renderLoop = () => {
    renderTime += engine.getDeltaTime();
    const pulse = 0.86 + Math.sin(renderTime * 0.007) * 0.14;
    fireLight.intensity = 7 * pulse;
    blueLight.intensity = 3.8 + Math.sin(renderTime * 0.012) * 1.2;
    scene.render();
  };
  engine.runRenderLoop(renderLoop);
  void enableOptionalHavok(scene, ground);

  return {
    engine,
    scene,
    camera,
    robots,
    workers,
    container,
    fireRoot,
    smokeRoot,
    routeRoot,
    renderLoop,
  };
}
