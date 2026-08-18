/**
 * Health Check Service
 * Provides comprehensive health status for the SENTINEL API
 */

import { prisma } from '@sentinel/db';

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';
export type OverallStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs?: number;
  message?: string;
  lastChecked: string;
}

export interface HealthResponse {
  status: OverallStatus;
  timestamp: string;
  version: string;
  uptime: number;
  components: {
    database: ComponentHealth;
    api: ComponentHealth;
  };
}

const startTime = Date.now();
const VERSION = process.env.npm_package_version || '0.1.0';

/**
 * Check database connectivity and latency
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const startMs = Date.now();

  try {
    // Simple query to verify connection
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startMs;

    // Consider latency > 1000ms as degraded
    const status: ComponentStatus = latencyMs > 1000 ? 'degraded' : 'healthy';
    const message = latencyMs > 1000 ? 'High latency detected' : undefined;

    return {
      status,
      latencyMs,
      message,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Database connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Check API health (always healthy if this code runs)
 */
function checkApi(): ComponentHealth {
  return {
    status: 'healthy',
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Determine overall status from component statuses
 */
function determineOverallStatus(components: HealthResponse['components']): OverallStatus {
  const statuses = Object.values(components).map((c) => c.status);

  if (statuses.some((s) => s === 'unhealthy')) {
    return 'unhealthy';
  }
  if (statuses.some((s) => s === 'degraded')) {
    return 'degraded';
  }
  return 'healthy';
}

/**
 * Get HTTP status code based on health status
 */
export function getHealthStatusCode(status: OverallStatus): 200 | 207 | 503 {
  switch (status) {
    case 'healthy':
      return 200;
    case 'degraded':
      return 207; // Multi-Status (some components degraded)
    case 'unhealthy':
      return 503; // Service Unavailable
  }
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(): Promise<HealthResponse> {
  const [database] = await Promise.all([checkDatabase()]);

  const components = {
    database,
    api: checkApi(),
  };

  return {
    status: determineOverallStatus(components),
    timestamp: new Date().toISOString(),
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    components,
  };
}

/**
 * Simple liveness check (for k8s liveness probes)
 * Returns quickly without checking dependencies
 */
export function livenessCheck(): { status: 'ok'; timestamp: string } {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness check (for k8s readiness probes)
 * Checks if the service is ready to accept traffic
 */
export async function readinessCheck(): Promise<{ ready: boolean; message?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      message: error instanceof Error ? error.message : 'Database not ready',
    };
  }
}
