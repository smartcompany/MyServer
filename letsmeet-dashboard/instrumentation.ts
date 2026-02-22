// LetsMeet Dashboard instrumentation
// 폴링은 simulator/letsmeet-simulator.js에서 담당 (대시보드와 같은 프로세스)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSimulator } = require("./simulator/letsmeet-simulator.js");
    startSimulator();
  }
}
