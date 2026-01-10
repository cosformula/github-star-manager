import { mock } from "bun:test";

// Response queue for sequential prompts interactions
let responseQueue: Array<Record<string, unknown>> = [];
let promptCallIndex = 0;

// Reset the mock state
export function resetPromptsMock() {
  responseQueue = [];
  promptCallIndex = 0;
}

// Add responses to the queue
export function queuePromptResponses(responses: Array<Record<string, unknown>>) {
  responseQueue.push(...responses);
}

// Create mock prompts function
export function createPromptsMock() {
  return mock(async (questions: unknown) => {
    const response = responseQueue[promptCallIndex] || {};
    promptCallIndex++;
    return response;
  });
}

// Preset response sequences for different test scenarios

// Dry run flow: analyze mode with dry run
export const dryRunFlowResponses: Array<Record<string, unknown>> = [
  // 1. Select mode
  { mode: "dryrun" },
  // 2. Main menu - select categorize
  { action: "categorize" },
  // 3. Handle existing lists - keep and suggest new
  { action: "keep_suggest" },
  // 4. Review and finalize lists - confirm
  { action: "confirm" },
  // 5. Skip already categorized repos - yes
  { skipCategorized: true },
  // 6. Review categorization - accept all
  { choice: "accept" },
  // 7. Show plan - execute
  { choice: "execute" },
  // 8. Main menu - exit
  { action: "exit" },
];

// Debug + Dry run flow
export const debugDryRunFlowResponses: Array<Record<string, unknown>> = [
  // 1. Select mode
  { mode: "debug_dryrun" },
  // 2. Main menu - select categorize
  { action: "categorize" },
  // 3. Handle existing lists - use existing only
  { action: "use_existing" },
  // 4. Skip already categorized repos - no
  { skipCategorized: false },
  // 5. Review categorization - accept all
  { choice: "accept" },
  // 6. Show plan - execute
  { choice: "execute" },
  // 7. Main menu - exit
  { action: "exit" },
];

// Unstar flow: cleanup repos
export const unstarFlowResponses: Array<Record<string, unknown>> = [
  // 1. Select mode
  { mode: "dryrun" },
  // 2. Main menu - select unstar/cleanup
  { action: "unstar" },
  // 3. Select unstar criteria
  { selectedCriteria: ["archived", "deprecated"] },
  // 4. Want custom criteria - no
  { wantCustom: false },
  // 5. Review unstar suggestions - accept all
  { choice: "accept" },
  // 6. Show plan - execute
  { choice: "execute" },
  // 7. Main menu - exit
  { action: "exit" },
];

// Restore flow
export const restoreFlowResponses: Array<Record<string, unknown>> = [
  // 1. Select mode
  { mode: "restore" },
  // 2. Select backup (would show list if backups exist)
  { selected: undefined }, // No backup selected, will show "no backups"
];

// Simple analyze flow (no existing lists)
export const simpleAnalyzeFlowResponses: Array<Record<string, unknown>> = [
  // 1. Select mode
  { mode: "dryrun" },
  // 2. Main menu - select categorize
  { action: "categorize" },
  // 3. Handle existing lists - keep and suggest (or view)
  { action: "keep_suggest" },
  // 4. Review and finalize lists - confirm
  { action: "confirm" },
  // 5. Skip categorized - yes
  { skipCategorized: true },
  // 6. Review categorization - accept
  { choice: "accept" },
  // 7. Show plan - execute
  { choice: "execute" },
  // 8. Main menu - exit
  { action: "exit" },
];

// Cancel flow - user cancels at list review
export const cancelFlowResponses: Array<Record<string, unknown>> = [
  // 1. Select mode
  { mode: "dryrun" },
  // 2. Main menu - select categorize
  { action: "categorize" },
  // 3. Handle existing lists - keep and suggest
  { action: "keep_suggest" },
  // 4. Review and finalize lists - cancel
  { action: "cancel" },
  // 5. Main menu - exit
  { action: "exit" },
];
