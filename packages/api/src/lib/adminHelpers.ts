/**
 * Common helpers for admin router procedures
 */

import { prisma } from '@sentinel/db';
import { TRPCError } from '@trpc/server';

/**
 * Fetches an organization by ID and throws NOT_FOUND if it doesn't exist.
 * Used by PDF export procedures that need the organization name.
 */
export async function getOrganizationOrThrow(organizationId: string): Promise<{ name: string }> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  if (!organization) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Organization not found',
    });
  }

  return organization;
}

/**
 * Builds a standardized PDF export response with base64-encoded data.
 */
export function buildPdfExportResponse(
  pdfBuffer: Buffer,
  filenamePrefix: string,
): { data: string; filename: string; contentType: string } {
  return {
    data: pdfBuffer.toString('base64'),
    filename: `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`,
    contentType: 'application/pdf',
  };
}
