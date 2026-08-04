/**
 * healthMonitor
 *
 * Manages periodic health checks against a set of registered services,
 * evaluates alert thresholds, and tracks failure/recovery state transitions.
 *
 * This is the live, actually-imported implementation at backend/src/services/.
 */

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  serviceId: string;
  status: ServiceStatus;
  /** Response time in milliseconds, or null if the check could not complete. */
  latencyMs: number | null;
  /** ISO timestamp of when the check ran. */
  checkedAt: string;
  /** Human-readable message or error detail. */
  message?: string;
}

export interface ServiceState {
  serviceId: string;
  currentStatus: ServiceStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastResult: HealthCheckResult | null;
}

export interface AlertThresholds {
  /** Number of consecutive failures before the service is marked unhealthy. */
  failureThreshold: number;
  /** Number of consecutive successes required to recover from unhealthy. */
  recoveryThreshold: number;
  /** Maximum acceptable latency in ms; breaching this marks the service degraded. */
  maxLatencyMs: number;
}

export type HealthCheckFn = (serviceId: string) => Promise<HealthCheckResult>;

export interface MonitorOptions {
  /** Milliseconds between scheduled check runs. Default: 30 000. */
  intervalMs?: number;
  thresholds?: Partial<AlertThresholds>;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  failureThreshold: 3,
  recoveryThreshold: 2,
  maxLatencyMs: 5_000,
};

/**
 * Evaluates a raw check result against the configured thresholds and the
 * previous service state to determine the new effective status.
 *
 * Rules:
 *  - latency > maxLatencyMs while the check itself succeeded → 'degraded'
 *  - consecutiveFailures >= failureThreshold → 'unhealthy'
 *  - consecutiveSuccesses >= recoveryThreshold (from unhealthy) → 'healthy'
 */
export function evaluateStatus(
  result: HealthCheckResult,
  previous: ServiceState,
  thresholds: AlertThresholds
): ServiceStatus {
  // A network-level failure always keeps the service unhealthy once it was
  // unhealthy, and progresses toward it otherwise.
  if (result.status === 'unhealthy') {
    const failures = previous.consecutiveFailures + 1;
    return failures >= thresholds.failureThreshold ? 'unhealthy' : previous.currentStatus;
  }

  // Latency breach → degraded (but doesn't count as a failure for threshold purposes)
  if (result.latencyMs !== null && result.latencyMs > thresholds.maxLatencyMs) {
    return 'degraded';
  }

  // Recovery path: if we were unhealthy we need enough consecutive successes.
  if (previous.currentStatus === 'unhealthy') {
    const successes = previous.consecutiveSuccesses + 1;
    return successes >= thresholds.recoveryThreshold ? 'healthy' : 'unhealthy';
  }

  return 'healthy';
}

/**
 * Applies a new check result to the current service state and returns the
 * updated state (immutably).
 */
export function applyResult(
  result: HealthCheckResult,
  current: ServiceState,
  thresholds: AlertThresholds
): ServiceState {
  const newStatus = evaluateStatus(result, current, thresholds);

  const isFailure = result.status === 'unhealthy';
  const isSuccess = !isFailure;

  return {
    serviceId: current.serviceId,
    currentStatus: newStatus,
    consecutiveFailures: isFailure ? current.consecutiveFailures + 1 : 0,
    consecutiveSuccesses: isSuccess ? current.consecutiveSuccesses + 1 : 0,
    lastResult: result,
  };
}

export class HealthMonitor {
  private readonly services: Map<string, HealthCheckFn> = new Map();
  private readonly states: Map<string, ServiceState> = new Map();
  private readonly thresholds: AlertThresholds;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MonitorOptions = {}) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  }

  /** Register a service to be monitored. */
  register(serviceId: string, checkFn: HealthCheckFn): void {
    this.services.set(serviceId, checkFn);
    this.states.set(serviceId, {
      serviceId,
      currentStatus: 'healthy',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastResult: null,
    });
  }

  /** Return the current state for a specific service. */
  getState(serviceId: string): ServiceState | undefined {
    return this.states.get(serviceId);
  }

  /** Return all service states. */
  getAllStates(): ServiceState[] {
    return Array.from(this.states.values());
  }

  /** Run health checks against all registered services immediately. */
  async runChecks(): Promise<ServiceState[]> {
    const updated: ServiceState[] = [];

    await Promise.all(
      Array.from(this.services.entries()).map(async ([serviceId, checkFn]) => {
        let result: HealthCheckResult;
        try {
          result = await checkFn(serviceId);
        } catch (err) {
          result = {
            serviceId,
            status: 'unhealthy',
            latencyMs: null,
            checkedAt: new Date().toISOString(),
            message: err instanceof Error ? err.message : String(err),
          };
        }

        const current = this.states.get(serviceId)!;
        const next = applyResult(result, current, this.thresholds);
        this.states.set(serviceId, next);
        updated.push(next);
      })
    );

    return updated;
  }

  /**
   * Start the background polling loop.
   * Has no effect if the monitor is already running.
   */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.runChecks();
    }, this.intervalMs);
  }

  /** Stop the background polling loop. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Returns true if the background loop is currently active. */
  isRunning(): boolean {
    return this.timer !== null;
  }
}
