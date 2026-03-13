import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { runWorldTick, startWorldTickLoop } from "./worldTick";

const app = new Hono();

app.use("*", cors());

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Solaris Backend API" });
});

app.post("/tick", async (c) => {
  const result = await runWorldTick();
  return c.json({ success: true, ...result, timestamp: Date.now() });
});

app.get("/tick/status", (c) => {
  return c.json({ running: true, timestamp: Date.now() });
});

startWorldTickLoop(5000);
console.log("[Backend] Solaris world tick loop started (5s interval)");

export default app;
