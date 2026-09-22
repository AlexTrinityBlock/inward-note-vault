/**
 * Regenerates the typed API client.
 *
 * This exists alongside `orval.config.ts` because that config file is loaded
 * through `jiti`, which spawns a child process on Windows — blocked outright in
 * sandboxed environments with `spawn EPERM`. Orval's programmatic `generate()`
 * takes the same options object directly, so nothing has to be spawned. The
 * option values below mirror `orval.config.ts`; keep the two in step.
 *
 * Usage:
 *   bun run api:generate                  # fetch the spec from a running backend
 *   bun run api:generate path/to/spec.json
 *   VITE_OPENAPI_SPEC=... bun run api:generate
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generate } from "orval";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

/** Where `uv run inward-note-vault` serves by default. */
const DEFAULT_SPEC_URL = "http://127.0.0.1:8000/openapi.json";

/**
 * Resolve the OpenAPI document to a local path, downloading it when the target
 * is a URL. Returns the path and a cleanup callback.
 */
async function resolveSpec() {
  const explicit = process.argv[2] ?? process.env.VITE_OPENAPI_SPEC;
  const target = explicit ?? DEFAULT_SPEC_URL;

  if (!/^https?:\/\//.test(target)) {
    return { target: path.resolve(root, target), cleanup: () => {} };
  }

  const response = await fetch(target);
  if (!response.ok) {
    throw new Error(
      `Could not read the OpenAPI schema from ${target} (HTTP ${response.status}). ` +
        "Start the backend, or pass a path to a schema file.",
    );
  }

  const directory = mkdtempSync(path.join(tmpdir(), "inward-openapi-"));
  const file = path.join(directory, "openapi.json");
  await Bun.write(file, await response.text());
  return { target: file, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

/** One project's options, as `orval.config.ts` declares under the `vault` key. */
function vaultProject(spec) {
  return {
    input: { target: spec },
    output: {
      target: "./src/client/generated/api.ts",
      schemas: "./src/client/generated/models",
      client: "react-query",
      httpClient: "fetch",
      mode: "tags-split",
      mock: false,
      override: {
        // Route every request through a fetcher that throws on non-2xx, so
        // React Query's error states actually work.
        mutator: { path: "./src/client/http.ts", name: "apiFetch" },
        fetch: {
          // Hooks then resolve to the payload itself instead of a
          // `{ status, data }` union, which keeps call sites readable.
          includeHttpResponseReturnType: false,
        },
      },
    },
  };
}

const spec = await resolveSpec();
try {
  await generate(vaultProject(spec.target), root, { throwOnError: true });
  console.log("Generated src/client/generated from the backend's OpenAPI schema.");
} finally {
  spec.cleanup();
}
