# CivicWeave WebMCP eval fixtures

`webmcp-cases.json` is a set of schema and tool-selection fixtures for the two CivicWeave services and the compiled `renew_permit_guided` tool. The cases cover normal routing, second-service reuse, human-lock preservation, schema rejection, safe workflow failure, and refusal to submit through an agent tool.

These fixtures describe expected tool choices and argument subsets. They are not a claim that a particular model will always make that choice. The deterministic Vitest and Playwright suites verify the browser, domain, safety, and end-to-end behavior once a tool call is made.

## Fixture fields

- `id`: stable case identifier.
- `pageState`: prerequisite state supplied by the eval harness.
- `messages`: user-facing conversation turns.
- `expectedTool`: expected next tool, or `null` when no WebMCP tool may perform the request.
- `expectedArgumentsSubset`: required subset of the tool input; generated IDs such as `viewId` may be supplied by the harness.
- `expectedOutcome`: optional result or safety behavior to assert.

An eval runner should reject unexpected tool names, compare only the declared argument subset, then execute through the same page adapter used by the app. For stateful cases, it should create the named `pageState` through earlier trusted calls and human UI actions rather than mutating internal store data.

## Validation

From the repository root:

```sh
node -e "JSON.parse(require('node:fs').readFileSync('evals/webmcp-cases.json', 'utf8')); console.log('eval JSON valid')"
npm run format:check
npm run test:e2e
```

The refusal case intentionally expects `null`: CivicWeave exposes no WebMCP submit tool. A person must use the visible **Confirm & Submit** control after reviewing the fictional draft.
