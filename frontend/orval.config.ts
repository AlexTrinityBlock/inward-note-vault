import { defineConfig } from "orval";

const spec = process.env.VITE_OPENAPI_SPEC ?? "http://127.0.0.1:8000/openapi.json";

/**
 * Generates typed React Query hooks from the backend's OpenAPI schema.
 * Run `bun run api:generate` with the backend up.
 */
export default defineConfig({
  vault: {
    input: spec,
    output: {
      target: "./src/client/generated/api.ts",
      schemas: "./src/client/generated/models",
      client: "react-query",
      httpClient: "fetch",
      mode: "tags-split",
      mock: false,
    },
  },
});
