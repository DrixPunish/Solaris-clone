import { createTRPCRouter } from "./create-context";
import { worldRouter } from "./routes/world";
import { actionsRouter } from "./routes/actions";

export const appRouter = createTRPCRouter({
  world: worldRouter,
  actions: actionsRouter,
});

export type AppRouter = typeof appRouter;
