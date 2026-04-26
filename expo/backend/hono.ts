import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { getEventWorkerStats } from "./eventWorker";

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

const trpcMiddleware = trpcServer({
  endpoint: "/api/trpc",
  router: appRouter,
  createContext,
});

app.use("/api/trpc/*", trpcMiddleware);
app.use("/trpc/*", trpcMiddleware);

app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "Solaris Backend API",
    version: "4.0.0-event-only",
    deployedAt: "2026-04-06T00:00:00Z",
  });
});

export default app;
