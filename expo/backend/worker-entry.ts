import { startEventWorkerLoop } from "./eventWorker";

console.log("[Worker] Starting Solaris event worker loop (1s interval)");
startEventWorkerLoop(1000);
