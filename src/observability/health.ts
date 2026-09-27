export type DatabaseHealthStatus =
  | 'available'
  | 'unavailable'
  | 'not_configured';

export type AuthenticationConfigurationStatus =
  | 'valid'
  | 'invalid'
  | 'not_configured';

export type SchedulerHealthStatus =
  | 'operational'
  | 'unavailable'
  | 'disabled'
  | 'not_configured';

export type OptionalProviderHealthStatus =
  | 'configured'
  | 'unavailable'
  | 'disabled';

export type OptionalProviderStatuses = Readonly<
  Record<string, OptionalProviderHealthStatus>
>;

export type SchedulerHealthProbe = () => Promise<SchedulerHealthStatus>;

/**
 * Runtime-only checks supplied by the composition root. Health handlers expose
 * their resulting states, never callback errors or dependency details.
 */
export interface ApiHealthOptions {
  readonly version?: string;
  readonly buildSha?: string;
  readonly databaseProbe?: (() => Promise<void>) | undefined;
  readonly authenticationConfiguration?:
    | AuthenticationConfigurationStatus
    | undefined;
  readonly schedulerProbe?: SchedulerHealthProbe | undefined;
  readonly optionalProviders?:
    | (() => OptionalProviderStatuses)
    | undefined;
}

export interface ReadinessBody {
  readonly service: 'elara-relay';
  readonly status: 'ready' | 'not_ready';
  readonly version: string;
  readonly buildSha: string;
  readonly schemaVersion: 1;
  readonly checks: {
    readonly database: DatabaseHealthStatus;
    readonly authentication: AuthenticationConfigurationStatus;
    readonly scheduler: SchedulerHealthStatus;
    readonly optionalProviders: OptionalProviderStatuses;
  };
}
