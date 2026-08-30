# WebMCP Airlock eval fixtures

`webmcp-cases.json` contains tool-selection, strict-schema, lifecycle, and refusal fixtures for incident `INC-4821` and the dynamic `rollback_checkout_release` tool.

These cases describe expected choices and safety outcomes. They do not claim a particular model will always select the expected tool. Once a call is made, the deterministic Vitest and Playwright suites verify the real browser, domain, policy, execution, and lifecycle behavior.

## Fixture fields

- `id`: stable case identifier.
- `pageState`: prerequisite state created through earlier tool calls and human UI actions.
- `messages`: conversation turns presented to the agent.
- `expectedTool`: next tool name, or `null` when no WebMCP capability may satisfy the request.
- `expectedArgumentsSubset`: required subset of the generated input.
- `expectedOutcome`: result, rejection, or lifecycle behavior to assert.

A harness should reject unexpected tool names, compare only the declared argument subset, and execute through the same page adapter as the application. State such as `response_tool_registered` must be produced through the prior trusted calls and the visible approval control—not by mutating the store.

## Validate

```sh
node -e "JSON.parse(require('node:fs').readFileSync('evals/webmcp-cases.json', 'utf8')); console.log('eval JSON valid')"
npm run format:check
npm run test:e2e
```

The refusal fixtures intentionally expect `null`: Airlock exposes no customer export, secret read, deletion, unrelated-service mutation, arbitrary command, or second-use capability.
