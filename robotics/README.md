# Optional ROS 2 / Gazebo bridge

Firebreak's judged demo runs entirely in the browser. This folder documents an optional adapter for a controlled ROS 2 lab or simulation; it is not required to run the web app and has not been certified for real emergency response.

## Reference stack

- Ubuntu 24.04
- ROS 2 Jazzy
- Gazebo Harmonic
- Nav2
- `rosbridge_suite`
- A warehouse world and four namespaced robot models

ROS 2 Jazzy and Gazebo Harmonic are the officially matched pairing. Rosbridge exposes ROS through a JSON WebSocket API. The historical AWS RoboMaker small warehouse repository is useful open warehouse scenery, but its upstream launch setup targets older Gazebo integration; importing or porting those assets to Harmonic is integration work, not part of the hosted demo.

References:

- [Gazebo and ROS version compatibility](https://gazebosim.org/docs/latest/ros_installation/)
- [ROS 2 Jazzy rosbridge_suite](https://docs.ros.org/en/jazzy/p/rosbridge_suite/index.html)
- [AWS RoboMaker small warehouse world](https://github.com/aws-robotics/aws-robomaker-small-warehouse-world)

## What the adapter can do

`src/control/ros2Driver.ts` implements the same narrow driver contract as the browser simulator. It accepts only the four built-in robot identifiers and constructs every topic and message type itself.

| Direction | Message type | Topic suffix |
| --- | --- | --- |
| Publish | `geometry_msgs/msg/Twist` | `/firebreak/<robot>/cmd_vel` |
| Publish | `geometry_msgs/msg/PoseStamped` | `/firebreak/<robot>/goal_pose` |
| Subscribe | `nav_msgs/msg/Odometry` | `/firebreak/<robot>/odom` |
| Subscribe | `sensor_msgs/msg/BatteryState` | `/firebreak/<robot>/battery` |
| Publish | `std_msgs/msg/Bool` | `/firebreak/fleet/emergency_stop` |

The robot slugs are exactly `scout-1`, `medic-2`, `suppress-3`, and `haul-4`. There is no API for an agent to provide a topic name, type, or raw ROS message.

## Lab setup

Install your ROS/Gazebo environment using the official instructions, then add the bridge and navigation packages:

```bash
sudo apt install ros-jazzy-ros-gz ros-jazzy-navigation2 ros-jazzy-nav2-bringup ros-jazzy-rosbridge-suite
```

Build and source the workspace that contains your four namespaced robot models, Nav2 launch files, and warehouse world:

```bash
cd ~/firebreak_ros2_ws
rosdep install --from-paths src --ignore-src -r -y
colcon build --symlink-install
source install/setup.bash
```

Start your Gazebo Harmonic warehouse and robot launch file in terminal one. The exact launch package belongs to the integration workspace because Firebreak does not ship robot URDFs or claim compatibility with a particular base:

```bash
ros2 launch <your_firebreak_sim_package> warehouse_fleet.launch.py
```

Start rosbridge in terminal two:

```bash
source /opt/ros/jazzy/setup.bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

Verify the contract before connecting the browser:

```bash
ros2 topic list | grep '^/firebreak/'
ros2 topic type /firebreak/medic-2/cmd_vel
ros2 topic type /firebreak/medic-2/goal_pose
ros2 topic echo --once /firebreak/medic-2/battery
```

Expected types are `geometry_msgs/msg/Twist`, `geometry_msgs/msg/PoseStamped`, and `sensor_msgs/msg/BatteryState` respectively. Keep the bridge bound to localhost for the simple `ws://127.0.0.1:9090` path. A remote bridge must use `wss://`, authentication at the reverse proxy, network isolation, and a server-side authorization policy that mirrors [rosbridge-allowlist.yaml](./rosbridge-allowlist.yaml).

## Control mapping and stop behavior

- Left stick or WASD maps to bounded linear and angular velocity.
- A velocity watchdog publishes zero after 350 ms without a fresh command.
- Approved mission waypoints publish map-frame pose goals.
- Emergency stop publishes zero velocity to all four robots, then publishes `true` on the fleet stop topic.
- Bridge loss clears watchdogs and marks the adapter disconnected. It never silently swaps a physical run to the browser simulator.

Browser-mode cancellation can restore a prior simulated snapshot. Physical reality cannot be rolled back: ROS mode stops the fleet and reports truthful partial progress. Operators must retain an independent hardware emergency stop and follow the robot manufacturer's safety guidance.

## Verification performed in this repository

The automated fake-bridge tests cover URL restrictions, topic/type allowlisting, command-shape rejection, clamps, velocity timeout, navigation goal shape, progress, fleet stop, telemetry unsubscription, and disconnect cleanup. No live ROS, Gazebo, controller hardware, or physical robot was available in the project release gate; those checks remain explicit optional integration tests.
