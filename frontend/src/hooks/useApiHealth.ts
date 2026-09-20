import { useQuery } from "@tanstack/react-query";

/** Shape of the backend's `GET /health` response. */
export type ApiHealth = {
  status: string;
};

/**
 * Liveness probe for the API, proxied by Vite in development.
 *
 * Hand-written for now; resource hooks come from the generated client in
 * `src/client/generated`.
 */
export function useApiHealth() {
  return useQuery({
    queryKey: ["api-health"],
    queryFn: async (): Promise<ApiHealth> => {
      const response = await fetch("/health");
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
      return (await response.json()) as ApiHealth;
    },
  });
}
