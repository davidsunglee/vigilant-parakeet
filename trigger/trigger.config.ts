// Deploy-time project reference setup:
// 1. Run: npx trigger.dev@latest login
// 2. Run: npx trigger.dev@latest init   (from this trigger/ directory)
//    This creates/links the cloud project and gives you a proj_... reference.
// 3. Replace proj_REPLACE_ME below with that reference.
// 4. Run: npx trigger.dev@latest deploy
//
// The unit suite (bun test) does not need a real project ref; deploy does.
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_lhevqdnezjyfvmxpxfql",
  dirs: ["./src/trigger"],
  // Max wall-clock seconds a single run may take before Trigger.dev cancels it.
  // Story generation fans out across multiple LLM + image calls, so allow 25 min.
  maxDuration: 1500,
  retries: {
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      randomize: true,
    },
  },
});
