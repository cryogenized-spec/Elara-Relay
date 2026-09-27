/**
 * Readiness port for the Operations API.
 *
 * The API surface declares the port; the Node runtime supplies the
 * implementation that observes PostgreSQL and the deployment lifecycle. That
 * keeps the dependency direction identical to `AuthVerifier`: the boundary
 * defines what it needs, infrastructure adapts to it.
 */

/**
 * Dependency check behind `GET /ready`.
 *
 * `true` means traffic may be routed to this instance. A probe must never
 * throw operational detail outward: it answers with a boolean and the API
 * translates that into a fixed status word.
 */
export interface ReadinessProbe {
  check(): Promise<boolean>;
}
