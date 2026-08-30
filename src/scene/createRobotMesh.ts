import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import type { RobotState } from "../domain/firebreakTypes";

export interface RobotMeshHandle {
  root: TransformNode;
  selectionRing: TransformNode;
  animatedParts: TransformNode[];
}

function material(scene: Scene, name: string, color: string, emissive = false) {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = Color3.FromHexString(color);
  result.specularColor = new Color3(0.16, 0.2, 0.24);
  if (emissive) result.emissiveColor = Color3.FromHexString(color).scale(0.8);
  return result;
}

function parent(meshes: AbstractMesh[], root: TransformNode): void {
  for (const mesh of meshes) mesh.parent = root;
}

function labelRobot(scene: Scene, robot: RobotState, root: TransformNode): void {
  const plane = MeshBuilder.CreatePlane(`${robot.id}-label`, { width: 2.5, height: 0.48 }, scene);
  plane.position = new Vector3(0, robot.role === "scout" ? 1.05 : 1.2, 0);
  plane.billboardMode = 7;
  plane.parent = root;
  plane.isPickable = false;
  const texture = new DynamicTexture(
    `${robot.id}-label-texture`,
    { width: 512, height: 96 },
    scene,
  );
  texture.hasAlpha = true;
  texture.drawText(robot.id, null, 67, "700 42px monospace", "#f4f7f8", "transparent", true);
  const labelMaterial = new StandardMaterial(`${robot.id}-label-material`, scene);
  labelMaterial.diffuseTexture = texture;
  labelMaterial.opacityTexture = texture;
  labelMaterial.emissiveColor = new Color3(0.75, 0.8, 0.84);
  labelMaterial.disableLighting = true;
  plane.material = labelMaterial;
}

export function createRobotMesh(scene: Scene, robot: RobotState): RobotMeshHandle {
  const root = new TransformNode(robot.id, scene);
  root.position.set(robot.position.x, robot.position.y, robot.position.z);
  root.rotation.y = robot.heading;
  const shell = material(scene, `${robot.id}-shell`, robot.color);
  const dark = material(scene, `${robot.id}-dark`, "#162029");
  const lamp = material(scene, `${robot.id}-lamp`, robot.color, true);
  const animatedParts: TransformNode[] = [];

  if (robot.role === "scout") {
    const body = MeshBuilder.CreateSphere(
      `${robot.id}-body`,
      { diameter: 0.85, segments: 12 },
      scene,
    );
    body.scaling.y = 0.45;
    body.material = shell;
    const mast = MeshBuilder.CreateCylinder(
      `${robot.id}-mast`,
      { height: 0.35, diameter: 0.12 },
      scene,
    );
    mast.position.y = 0.35;
    mast.material = dark;
    const sensor = MeshBuilder.CreateSphere(
      `${robot.id}-sensor`,
      { diameter: 0.22, segments: 8 },
      scene,
    );
    sensor.position.set(0, 0.55, 0.04);
    sensor.material = lamp;
    const arms = [
      MeshBuilder.CreateBox(`${robot.id}-arm-a`, { width: 2.05, height: 0.08, depth: 0.08 }, scene),
      MeshBuilder.CreateBox(`${robot.id}-arm-b`, { width: 0.08, height: 0.08, depth: 2.05 }, scene),
    ];
    for (const arm of arms) arm.material = dark;
    const rotors = [
      [-0.95, -0.95],
      [0.95, -0.95],
      [-0.95, 0.95],
      [0.95, 0.95],
    ].map(([x, z], index) => {
      const rotor = MeshBuilder.CreateCylinder(
        `${robot.id}-rotor-${index}`,
        { height: 0.035, diameter: 0.66, tessellation: 12 },
        scene,
      );
      rotor.position.set(x!, 0.04, z!);
      rotor.material = shell;
      animatedParts.push(rotor);
      return rotor;
    });
    parent([body, mast, sensor, ...arms, ...rotors], root);
  } else {
    const wide = robot.role === "haul" ? 1.7 : 1.35;
    const body = MeshBuilder.CreateBox(
      `${robot.id}-body`,
      { width: wide, height: 0.62, depth: 1.65 },
      scene,
    );
    body.position.y = 0.34;
    body.material = shell;
    const cabin = MeshBuilder.CreateBox(
      `${robot.id}-cabin`,
      { width: wide * 0.72, height: 0.48, depth: 0.72 },
      scene,
    );
    cabin.position.set(0, 0.82, -0.15);
    cabin.material = dark;
    const beacon = MeshBuilder.CreateCylinder(
      `${robot.id}-beacon`,
      { height: 0.18, diameter: 0.22, tessellation: 10 },
      scene,
    );
    beacon.position.set(0, 1.18, -0.15);
    beacon.material = lamp;
    const wheels = [-0.62, 0.62].flatMap((x) =>
      [-0.52, 0.52].map((z, index) => {
        const wheel = MeshBuilder.CreateCylinder(
          `${robot.id}-wheel-${x}-${index}`,
          { height: 0.25, diameter: 0.48, tessellation: 12 },
          scene,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x * (wide / 1.35), 0.13, z);
        wheel.material = dark;
        animatedParts.push(wheel);
        return wheel;
      }),
    );
    const roleParts: AbstractMesh[] = [];
    if (robot.role === "rescue") {
      const stretcher = MeshBuilder.CreateBox(
        `${robot.id}-stretcher`,
        { width: 0.92, height: 0.09, depth: 1.35 },
        scene,
      );
      stretcher.position.set(0, 0.72, 0.37);
      stretcher.material = lamp;
      roleParts.push(stretcher);
    } else if (robot.role === "suppress") {
      const tank = MeshBuilder.CreateCylinder(
        `${robot.id}-tank`,
        { height: 1, diameter: 0.55, tessellation: 12 },
        scene,
      );
      tank.rotation.x = Math.PI / 2;
      tank.position.set(0, 0.73, 0.25);
      tank.material = dark;
      const nozzle = MeshBuilder.CreateCylinder(
        `${robot.id}-nozzle`,
        { height: 1.15, diameter: 0.11, tessellation: 8 },
        scene,
      );
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 1.02, 0.4);
      nozzle.material = lamp;
      roleParts.push(tank, nozzle);
    } else {
      const forkA = MeshBuilder.CreateBox(
        `${robot.id}-fork-a`,
        { width: 0.16, height: 0.1, depth: 1.15 },
        scene,
      );
      forkA.position.set(-0.42, 0.16, 1.02);
      forkA.material = lamp;
      const forkB = forkA.clone(`${robot.id}-fork-b`)!;
      forkB.position.x = 0.42;
      roleParts.push(forkA, forkB);
    }
    parent([body, cabin, beacon, ...wheels, ...roleParts], root);
  }

  const ringMesh = MeshBuilder.CreateTorus(
    `${robot.id}-selection`,
    { diameter: robot.role === "scout" ? 2.5 : 2.25, thickness: 0.055, tessellation: 32 },
    scene,
  );
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.y = robot.role === "scout" ? -2.25 : -0.42;
  ringMesh.material = lamp;
  ringMesh.parent = root;
  ringMesh.setEnabled(false);
  labelRobot(scene, robot, root);
  return { root, selectionRing: ringMesh, animatedParts };
}
