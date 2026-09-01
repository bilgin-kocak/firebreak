import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFirebreakStore } from "../store/useFirebreakStore";
import { FirebreakScene, type FirebreakSceneFactory } from "./FirebreakScene";

describe("FirebreakScene", () => {
  beforeEach(() => {
    useFirebreakStore.getState().setPersistenceStorage(undefined);
    useFirebreakStore.getState().resetDemo();
  });

  it("initializes once, synchronizes updates, resizes, and disposes", async () => {
    const synchronizer = {
      applySnapshot: vi.fn(),
      setCameraMode: vi.fn(),
      setSelectedRobot: vi.fn(),
      setReducedEffects: vi.fn(),
      adjustCamera: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    const factory = vi.fn(async () => synchronizer) satisfies FirebreakSceneFactory;
    const { unmount } = render(<FirebreakScene factory={factory} />);

    expect(screen.getByRole("img", { name: /interactive warehouse rescue scene/i })).toBeVisible();
    expect(screen.getByRole("status", { name: /scene status/i })).toHaveTextContent(
      /four robots ready/i,
    );
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(synchronizer.applySnapshot).toHaveBeenCalled());

    act(() => useFirebreakStore.getState().selectRobot("HAUL-4"));
    await waitFor(() => expect(synchronizer.setSelectedRobot).toHaveBeenLastCalledWith("HAUL-4"));
    act(() => window.dispatchEvent(new Event("resize")));
    expect(synchronizer.resize).toHaveBeenCalled();

    unmount();
    expect(synchronizer.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the semantic rescue experience when graphics initialization fails", async () => {
    const factory = vi.fn(async () => {
      throw new Error("WebGL unavailable");
    }) satisfies FirebreakSceneFactory;
    render(<FirebreakScene factory={factory} />);

    expect(
      await screen.findByText(/3D graphics are unavailable; mission controls still work/i),
    ).toBeVisible();
    expect(screen.getByText(/Mara Chen.*trapped/i)).toBeVisible();
    expect(screen.getByText(/Jon Bell.*trapped/i)).toBeVisible();
  });

  it("lets execution override the stored camera without changing operator preferences", async () => {
    const synchronizer = {
      applySnapshot: vi.fn(),
      setCameraMode: vi.fn(),
      setSelectedRobot: vi.fn(),
      setReducedEffects: vi.fn(),
      adjustCamera: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    const factory = vi.fn(async () => synchronizer) satisfies FirebreakSceneFactory;
    const { rerender } = render(
      <FirebreakScene factory={factory} cameraModeOverride="follow" focusRobotId="MEDIC-2" />,
    );

    await waitFor(() => expect(synchronizer.setCameraMode).toHaveBeenLastCalledWith("follow"));
    expect(synchronizer.setSelectedRobot).toHaveBeenLastCalledWith("MEDIC-2");
    expect(useFirebreakStore.getState().ui.cameraMode).toBe("overview");
    expect(useFirebreakStore.getState().world.selectedRobotId).toBe("SCOUT-1");

    rerender(
      <FirebreakScene factory={factory} cameraModeOverride="overview" focusRobotId="HAUL-4" />,
    );
    await waitFor(() => expect(synchronizer.setCameraMode).toHaveBeenLastCalledWith("overview"));
    expect(synchronizer.setSelectedRobot).toHaveBeenLastCalledWith("HAUL-4");
    expect(useFirebreakStore.getState().ui.cameraMode).toBe("overview");
    expect(useFirebreakStore.getState().world.selectedRobotId).toBe("SCOUT-1");
  });
});
