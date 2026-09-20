import { defineConfig } from "orval";

const spec = process.env.VITE_OPENAPI_SPEC ?? "http://127.0.0.1:8000/openapi.json";

/**
 * Generates typed React Query hooks from the backend's OpenAPI schema.
 *
 * The default spec URL expects a running backend; point `VITE_OPENAPI_SPEC` at
 * a schema file to generate offline. Generated code is committed, so a fresh
 * clone builds without regenerating.
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
      override: {
        fetch: {
          // Hooks then resolve to the payload itself instead of a
          // `{ status, data }` union, which keeps call sites readable.
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
