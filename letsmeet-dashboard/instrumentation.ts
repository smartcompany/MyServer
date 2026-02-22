// LetsMeet Dashboard instrumentation (no-op)
// Prevents parent RasberryHomeServer instrumentation.js from being used
export async function register() {
  // Dashboard does not need server startup hooks
}
