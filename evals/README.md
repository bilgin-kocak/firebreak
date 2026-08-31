# Firebreak WebMCP eval fixtures

`webmcp-cases.json` contains tool-selection, strict-schema, safety, authorization, lifecycle, and refusal cases for warehouse emergency `WH-01` and the dynamic `execute_rescue_mission` tool.

These fixtures describe expected choices and safety outcomes; they do not claim every model will always choose the expected tool. Once a call is made, the deterministic Vitest and Playwright suites verify the real browser handlers, world state, compiled routes, execution, and registration lifecycle.

## Fixture fields

- `id`: stable case identifier.
- `pageState`: prerequisite state produced through prior tool calls or human UI actions.
- `messages`: conversation turns presented to an agent.
- `expectedTool`: next tool name, or `null` when no WebMCP capability may satisfy the request.
- `expectedArgumentsSubset`: required subset of the generated input.
- `expectedOutcome`: result, rejection, or lifecycle behavior to assert.

The harness must produce states through the page adapter and visible human controls. It must never mutate the store directly to create `mission_authorized` or `mission_completed`.

## Validate

```sh
node -e "JSON.parse(require('node:fs').readFileSync('evals/webmcp-cases.json', 'utf8')); console.log('eval JSON valid')"
npm run format:check
npm run test:e2e
```

Refusal fixtures intentionally expect `null`: Firebreak exposes no agent approval, arbitrary waypoint, free-form ROS topic, raw message, forbidden-zone override, second-use, or unrelated robot capability.
