import type {
  FirebreakSnapshot,
  RobotId,
} from "../domain/firebreakTypes";

export interface NormalizedControl {
  throttle: number;
  turn: number;
  cameraX: number;
  cameraY: number;
  action: boolean;
  selectDelta: -1 | 0 | 1;
}

export interface InputSnapshot extends NormalizedControl {
  source: "none" | "keyboard" | "touch" | "gamepad";
  selectRobot?: RobotId;
}

export interface TouchControlState {
  throttle: number;
  turn: number;
  action: boolean;
}

export interface ManualRobotCommand {
  robotId: RobotId;
  throttle: number;
  turn: number;
  action: boolean;
  deltaMs: number;
}

export interface RobotDriver {
  readonly mode: "browser" | "ros2";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  commandManual(command: ManualRobotCommand): Promise<void>;
  stopAll(reason: string): Promise<void>;
}

export interface BrowserDriverOptions {
  readSnapshot: () => FirebreakSnapshot;
  commitSnapshot: (snapshot: FirebreakSnapshot) => void;
}
