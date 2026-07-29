import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  HealthMonitor,
  applyResult,
  evaluateStatus,
  type AlertThresholds,
  type HealthCheckResult,
  type ServiceState,
} from './healthMonitor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<HealthCheckResult> = {}
): HealthCheckResult {
  return {
    serviceId: 'svc-a',
    status: 'healthy',
    latencyMs: 100,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(overrides: Partial<ServiceState> = {}): ServiceState {
  return {
    serviceId: 'svc-a',
    currentStatus: 'healthy',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastResult: null,
    ...overrides,
  };
}

const defaultThresholds: AlertThresholds = {
  failureThreshold: 3,
  recoveryThreshold: 2,
  maxLatencyMs: 5_000,
};

// ---------------------------------------------------------------------------
// evaluateStatus – alert-threshold evaluation logic
// ---------------------------------------------------------------------------

describe('evaluateStatus', () => {
  describe('failure threshold evaluation', () => {
    it('keeps previous status when consecutive failures have not reached threshold', () => {
      const result = makeResult({ status: 'unhealthy' });
      const state = makeState({ consecutiveFailures: 1 }); // 1 + 1 = 2 < 3

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('healthy');
    });

    it('marks unhealthy once consecutive failures reach the threshold', () => {
      const result = makeResult({ status: 'unhealthy' });
      const state = makeState({ consecutiveFailures: 2 }); // 2 + 1 = 3 >= 3

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('unhealthy');
    });

    it('marks unhealthy immediately with a threshold of 1', () => {
      const thresholds = { ...defaultThresholds, failureThreshold: 1 };
      const result = makeResult({ status: 'unhealthy' });
      const state = makeState({ consecutiveFailures: 0 });

      expect(evaluateStatus(result, state, thresholds)).toBe('unhealthy');
    });

    it('stays unhealthy when already unhealthy and another failure occurs', () => {
      const result = makeResult({ status: 'unhealthy' });
      const state = makeState({
        currentStatus: 'unhealthy',
        consecutiveFailures: 5,
      });

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('unhealthy');
    });
  });

  describe('latency threshold evaluation', () => {
    it('returns degraded when latency exceeds maxLatencyMs on an otherwise healthy result', () => {
      const result = makeResult({ status: 'healthy', latencyMs: 6_000 });
      const state = makeState();

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('degraded');
    });

    it('returns healthy when latency is exactly at the maxLatencyMs boundary', () => {
      const result = makeResult({ status: 'healthy', latencyMs: 5_000 });
      const state = makeState();

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('healthy');
    });

    it('returns healthy when latency is below maxLatencyMs', () => {
      const result = makeResult({ status: 'healthy', latencyMs: 200 });
      const state = makeState();

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('healthy');
    });

    it('ignores null latency for the latency check', () => {
      const result = makeResult({ status: 'healthy', latencyMs: null });
      const state = makeState();

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('healthy');
    });
  });

  describe('recovery threshold evaluation', () => {
    it('keeps unhealthy until consecutive successes reach the recovery threshold', () => {
      const result = makeResult({ status: 'healthy' });
      const state = makeState({
        currentStatus: 'unhealthy',
        consecutiveSuccesses: 0, // 0 + 1 = 1 < 2
      });

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('unhealthy');
    });

    it('transitions to healthy when recovery threshold is reached', () => {
      const result = makeResult({ status: 'healthy' });
      const state = makeState({
        currentStatus: 'unhealthy',
        consecutiveSuccesses: 1, // 1 + 1 = 2 >= 2
      });

      expect(evaluateStatus(result, state, defaultThresholds)).toBe('healthy');
    });

    it('recovers immediately with a threshold of 1', () => {
      const thresholds = { ...defaultThresholds, recoveryThreshold: 1 };
      const result = makeResult({ status: 'healthy' });
      const state = makeState({
        currentStatus: 'unhealthy',
        consecutiveSuccesses: 0,
      });

      expect(evaluateStatus(result, state, thresholds)).toBe('healthy');
    });
  });
});

// ---------------------------------------------------------------------------
// applyResult – state transition logic
// ---------------------------------------------------------------------------

describe('applyResult', () => {
  it('resets consecutiveFailures to 0 on a successful check', () => {
    const result = makeResult({ status: 'healthy', latencyMs: 50 });
    const state = makeState({ consecutiveFailures: 2 });

    const next = applyResult(result, state, defaultThresholds);

    expect(next.consecutiveFailures).toBe(0);
    expect(next.consecutiveSuccesses).toBe(1);
    expect(next.lastResult).toBe(result);
  });

  it('increments consecutiveFailures on a failing check', () => {
    const result = makeResult({ status: 'unhealthy' });
    const state = makeState({ consecutiveFailures: 1 });

    const next = applyResult(result, state, defaultThresholds);

    expect(next.consecutiveFailures).toBe(2);
    expect(next.consecutiveSuccesses).toBe(0);
  });

  it('resets consecutiveSuccesses to 0 on a failure', () => {
    const result = makeResult({ status: 'unhealthy' });
    const state = makeState({ consecutiveSuccesses: 3 });

    const next = applyResult(result, state, defaultThresholds);

    expect(next.consecutiveSuccesses).toBe(0);
  });

  it('stores the latest result on the returned state', () => {
    const result = makeResult({ message: 'all good', latencyMs: 42 });
    const state = makeState();

    const next = applyResult(result, state, defaultThresholds);

    expect(next.lastResult).toStrictEqual(result);
  });

  it('returns a new object and does not mutate the original state', () => {
    const result = makeResult({ status: 'unhealthy' });
    const original = makeState({ consecutiveFailures: 0 });
    const snapshot = { ...original };

    applyResult(result, original, defaultThresholds);

    expect(original).toStrictEqual(snapshot);
  });

  describe('failure → unhealthy transition', () => {
    it('transitions to unhealthy after failureThreshold consecutive failures', () => {
      let state = makeState();

      for (let i = 0; i < defaultThresholds.failureThreshold; i++) {
        state = applyResult(makeResult({ status: 'unhealthy' }), state, defaultThresholds);
      }

      expect(state.currentStatus).toBe('unhealthy');
    });
  });

  describe('unhealthy → healthy recovery', () => {
    it('recovers to healthy after recoveryThreshold consecutive successes', () => {
      // Start unhealthy.
      let state = makeState({ currentStatus: 'unhealthy' });

      for (let i = 0; i < defaultThresholds.recoveryThreshold; i++) {
        state = applyResult(makeResult({ status: 'healthy', latencyMs: 50 }), state, defaultThresholds);
      }

      expect(state.currentStatus).toBe('healthy');
    });

    it('does not recover early when only one success is seen (threshold=2)', () => {
      let state = makeState({ currentStatus: 'unhealthy', consecutiveSuccesses: 0 });
      state = applyResult(makeResult({ status: 'healthy' }), state, defaultThresholds);

      // One success with threshold=2 should stay unhealthy.
      expect(state.currentStatus).toBe('unhealthy');
      expect(state.consecutiveSuccesses).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// HealthMonitor – scheduling, registration and state management
// ---------------------------------------------------------------------------

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new HealthMonitor({
      intervalMs: 10_000,
      thresholds: { failureThreshold: 3, recoveryThreshold: 2, maxLatencyMs: 5_000 },
    });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  describe('register', () => {
    it('makes the service available and initialises it as healthy', () => {
      monitor.register('api', vi.fn());

      const state = monitor.getState('api');
      expect(state).toBeDefined();
      expect(state!.currentStatus).toBe('healthy');
      expect(state!.consecutiveFailures).toBe(0);
    });

    it('returns undefined for unregistered services', () => {
      expect(monitor.getState('not-registered')).toBeUndefined();
    });
  });

  describe('runChecks', () => {
    it('runs all registered check functions and updates state', async () => {
      const checkFn = vi.fn().mockResolvedValue(
        makeResult({ serviceId: 'svc-b', status: 'healthy', latencyMs: 80 })
      );
      monitor.register('svc-b', checkFn);

      const results = await monitor.runChecks();

      expect(checkFn).toHaveBeenCalledOnce();
      expect(results).toHaveLength(1);
      expect(results[0].serviceId).toBe('svc-b');
      expect(results[0].currentStatus).toBe('healthy');
    });

    it('handles check function throwing an exception gracefully', async () => {
      monitor.register('flaky', () => Promise.reject(new Error('network error')));

      const results = await monitor.runChecks();

      expect(results[0].lastResult?.status).toBe('unhealthy');
      expect(results[0].lastResult?.message).toBe('network error');
    });

    it('accumulates failure count across multiple runChecks calls', async () => {
      const alwaysFail = vi.fn().mockResolvedValue(
        makeResult({ status: 'unhealthy', latencyMs: null })
      );
      monitor.register('bad-svc', alwaysFail);

      await monitor.runChecks();
      await monitor.runChecks();
      const results = await monitor.runChecks();

      expect(results[0].consecutiveFailures).toBe(3);
      expect(results[0].currentStatus).toBe('unhealthy');
    });

    it('transitions service from unhealthy back to healthy after recovery', async () => {
      const checkFn = vi
        .fn()
        .mockResolvedValueOnce(makeResult({ status: 'unhealthy' }))
        .mockResolvedValueOnce(makeResult({ status: 'unhealthy' }))
        .mockResolvedValueOnce(makeResult({ status: 'unhealthy' }))
        // Recovery: 2 consecutive successes needed.
        .mockResolvedValue(makeResult({ status: 'healthy', latencyMs: 100 }));

      const svcMonitor = new HealthMonitor({
        thresholds: { failureThreshold: 3, recoveryThreshold: 2, maxLatencyMs: 5_000 },
      });
      svcMonitor.register('recovering', checkFn);

      // Drive it unhealthy.
      await svcMonitor.runChecks();
      await svcMonitor.runChecks();
      await svcMonitor.runChecks();
      expect(svcMonitor.getState('recovering')!.currentStatus).toBe('unhealthy');

      // First recovery check – still unhealthy.
      await svcMonitor.runChecks();
      expect(svcMonitor.getState('recovering')!.currentStatus).toBe('unhealthy');

      // Second recovery check – now healthy.
      await svcMonitor.runChecks();
      expect(svcMonitor.getState('recovering')!.currentStatus).toBe('healthy');
    });

    it('marks service as degraded when latency exceeds threshold', async () => {
      monitor.register('slow-api', vi.fn().mockResolvedValue(
        makeResult({ status: 'healthy', latencyMs: 6_000 })
      ));

      const results = await monitor.runChecks();

      expect(results[0].currentStatus).toBe('degraded');
    });
  });

  describe('getAllStates', () => {
    it('returns an empty array when no services are registered', () => {
      expect(monitor.getAllStates()).toEqual([]);
    });

    it('returns a state entry for each registered service', () => {
      monitor.register('alpha', vi.fn());
      monitor.register('beta', vi.fn());

      expect(monitor.getAllStates()).toHaveLength(2);
    });
  });

  describe('start / stop scheduling', () => {
    it('is not running before start() is called', () => {
      expect(monitor.isRunning()).toBe(false);
    });

    it('is running after start() is called', () => {
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
    });

    it('stops running after stop() is called', () => {
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('calling start() twice does not create a second timer', () => {
      monitor.start();
      monitor.start(); // should be a no-op
      expect(monitor.isRunning()).toBe(true);
      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('triggers runChecks on each interval tick', async () => {
      const checkFn = vi.fn().mockResolvedValue(makeResult({ serviceId: 'timed' }));
      monitor.register('timed', checkFn);
      monitor.start();

      // Advance past 3 intervals.
      vi.advanceTimersByTime(30_001);
      await vi.runAllTimersAsync();

      expect(checkFn.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });
});
