/**
 * Shared utilities for database seed scripts
 */

import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PolicyEffect, PrismaClient } from '../src/generated/prisma/client';

/**
 * Creates a configured Prisma client with PostgreSQL adapter
 */
export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

/**
 * Runs a seed function with proper error handling and cleanup
 */
export function runSeed(seedFn: (prisma: PrismaClient) => Promise<void>): void {
  const prisma = createPrismaClient();

  seedFn(prisma)
    .catch((e: unknown) => {
      console.error('Error:', e);
      process.exit(1);
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}

/**
 * Generate a date in the past (days ago) with randomized time
 */
export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(
    Math.floor(Math.random() * 24),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
  );
  return date;
}

/**
 * Generates a deterministic slug from policy data
 * This matches the implementation in packages/api/src/services/policy.ts
 */
export function generatePolicySlug(
  matchers: string[],
  toolPatterns: string[],
  effect: PolicyEffect,
  existingSlugs: Set<string>,
): string {
  const normalizeMatcher = (m: string): string => {
    if (m === '*') return 'all';
    return m
      .toLowerCase()
      .replace(/:/g, '-')
      .replace(/@/g, '-at-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const normalizeToolPattern = (pattern: string): string => {
    return pattern
      .toLowerCase()
      .replace(/::/g, '-')
      .replace(/:/g, '-')
      .replace(/\./g, '-')
      .replace(/\*/g, 'all')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const normalizedEffect = effect.toLowerCase();
  const firstMatcher = matchers[0] ?? '*';
  const firstToolPattern = toolPatterns[0] ?? '*::*';
  const matcherPart = normalizeMatcher(firstMatcher);
  const toolPart = normalizeToolPattern(firstToolPattern);

  const multiSuffix =
    matchers.length > 1 || toolPatterns.length > 1
      ? `-multi-${matchers.length}m${toolPatterns.length}t`
      : '';

  const baseSlug = `${normalizedEffect}-${matcherPart}-${toolPart}${multiSuffix}`;
  const maxBaseLength = 90;
  let slug =
    baseSlug.length > maxBaseLength
      ? baseSlug.slice(0, maxBaseLength).replace(/-+$/, '')
      : baseSlug;

  if (existingSlugs.has(slug)) {
    let counter = 2;
    let candidate = `${slug}-${counter}`;
    while (existingSlugs.has(candidate) && counter < 9999 && candidate.length <= 100) {
      counter++;
      candidate = `${slug}-${counter}`;
    }
    slug = candidate;
  }

  return slug.length > 100 ? slug.slice(0, 100) : slug;
}
