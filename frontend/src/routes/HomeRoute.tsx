import { useApiHealth } from "../hooks/useApiHealth";

export function HomeRoute() {
  const { data, isPending, isError } = useApiHealth();

  const status = isPending ? "checking…" : isError ? "unreachable" : data.status;

  return (
    <section>
      <h1>Notes</h1>
      <p>
        Backend: <strong>{status}</strong>
      </p>
      <p className="hint">
        Typed API hooks are generated from the backend OpenAPI schema with{" "}
        <code>bun run api:generate</code> and land in <code>src/client/generated</code>.
      </p>
    </section>
  );
}
