import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@canto/api";

export const trpc = createTRPCReact<AppRouter>();
