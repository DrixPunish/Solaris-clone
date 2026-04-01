import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import { supabase } from "@/utils/supabase";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;

  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_RORK_API_BASE_URL is not set",
    );
  }

  return url;
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      async headers() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          return {
            Authorization: `Bearer ${session.access_token}`,
          };
        }
        return {};
      },
    }),
  ],
});
