/**
 * Email Service
 * Shared email sending utility using Resend API
 */

import { logger } from './logger.js';

/** HTTP timeout for email API calls */
const HTTP_TIMEOUT_MS = 30000;

/** Result of an email send operation */
export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/** Email payload structure */
export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends an email using the Resend API
 * Requires RESEND_API_KEY environment variable
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    logger.warn('Email not sent: RESEND_API_KEY not configured');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const fromAddress = process.env.EMAIL_FROM || 'Sentinel <notifications@sentinel.london>';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text();

    if (response.ok) {
      try {
        const data = JSON.parse(responseBody) as { id?: string };
        return { success: true, id: data.id };
      } catch {
        return { success: true };
      }
    }

    // Parse error response
    try {
      const errorData = JSON.parse(responseBody) as { message?: string };
      return { success: false, error: errorData.message ?? 'Unknown Resend API error' };
    } catch {
      return { success: false, error: `HTTP ${response.status}: ${responseBody}` };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Email request timed out' };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send email', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Generates milestone achievement email HTML
 */
export function generateMilestoneEmailHtml(
  milestone: { title: string; description: string; featureLink?: string },
  orgName: string,
): string {
  const featureLinkHtml = milestone.featureLink
    ? `<p style="margin: 16px 0 0 0;"><a href="${milestone.featureLink}" style="color: #7c3aed; text-decoration: none;">Learn more &rarr;</a></p>`
    : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 32px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px;">🎉 Milestone Achieved!</h1>
      </div>
      <div style="padding: 32px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px;">${milestone.title}</h2>
        <p style="margin: 0; color: #4b5563; font-size: 16px; line-height: 1.6;">${milestone.description}</p>
        ${featureLinkHtml}
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="margin: 0; color: #9ca3af; font-size: 14px;">
          Keep up the great work with ${orgName}!
        </p>
        <p style="margin: 16px 0 0 0; color: #9ca3af; font-size: 12px;">
          Sentinel Control Plane
        </p>
      </div>
    </div>
  `;
}

/**
 * Generates monthly digest email HTML
 */
export function generateDigestEmailHtml(
  orgName: string,
  stats: {
    toolCalls: { total: number; allowed: number; denied: number };
    activeUsers: number;
    activeAgents: number;
    policiesTriggered: number;
    peakHour: { hour: number; dayOfWeek: string } | null;
  },
  featureSpotlight: { title: string; description: string; docUrl: string } | null,
  periodLabel: string,
): string {
  const peakHourText = stats.peakHour
    ? `${stats.peakHour.dayOfWeek}s at ${stats.peakHour.hour}:00 UTC`
    : 'N/A';

  const featureSection = featureSpotlight
    ? `
      <div style="margin: 24px 0; padding: 20px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
        <h3 style="margin: 0 0 8px 0; color: #0369a1; font-size: 16px;">💡 Feature Spotlight: ${featureSpotlight.title}</h3>
        <p style="margin: 0 0 12px 0; color: #0c4a6e; font-size: 14px;">${featureSpotlight.description}</p>
        <a href="${featureSpotlight.docUrl}" style="color: #0284c7; text-decoration: none; font-size: 14px;">Learn more &rarr;</a>
      </div>
    `
    : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px;">Monthly Usage Report</h1>
        <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">${orgName} • ${periodLabel}</p>
      </div>
      <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none;">
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 18px;">Activity Summary</h2>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="color: #6b7280;">Total Tool Calls</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
              <strong style="color: #111827; font-size: 18px;">${stats.toolCalls.total.toLocaleString()}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="color: #6b7280;">Allowed / Denied</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
              <span style="color: #22c55e;">${stats.toolCalls.allowed.toLocaleString()}</span>
              <span style="color: #9ca3af;"> / </span>
              <span style="color: #ef4444;">${stats.toolCalls.denied.toLocaleString()}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="color: #6b7280;">Active Users</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
              <strong style="color: #111827;">${stats.activeUsers}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="color: #6b7280;">Active Agents</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
              <strong style="color: #111827;">${stats.activeAgents}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
              <span style="color: #6b7280;">Policies Triggered</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
              <strong style="color: #111827;">${stats.policiesTriggered}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0;">
              <span style="color: #6b7280;">Peak Activity</span>
            </td>
            <td style="padding: 12px 0; text-align: right;">
              <strong style="color: #111827;">${peakHourText}</strong>
            </td>
          </tr>
        </table>

        ${featureSection}
      </div>
      <div style="padding: 24px 32px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
          Sentinel Control Plane • <a href="#" style="color: #9ca3af;">Manage email preferences</a>
        </p>
      </div>
    </div>
  `;
}

/**
 * Generates plain text version of milestone email
 */
export function generateMilestoneEmailText(
  milestone: { title: string; description: string; featureLink?: string },
  orgName: string,
): string {
  const featureLine = milestone.featureLink ? `\nLearn more: ${milestone.featureLink}` : '';
  return `🎉 Milestone Achieved!

${milestone.title}

${milestone.description}${featureLine}

Keep up the great work with ${orgName}!

--
Sentinel Control Plane`;
}

/**
 * Generates plain text version of digest email
 */
export function generateDigestEmailText(
  orgName: string,
  stats: {
    toolCalls: { total: number; allowed: number; denied: number };
    activeUsers: number;
    activeAgents: number;
    policiesTriggered: number;
    peakHour: { hour: number; dayOfWeek: string } | null;
  },
  featureSpotlight: { title: string; description: string; docUrl: string } | null,
  periodLabel: string,
): string {
  const peakHourText = stats.peakHour
    ? `${stats.peakHour.dayOfWeek}s at ${stats.peakHour.hour}:00 UTC`
    : 'N/A';

  const featureSection = featureSpotlight
    ? `
Feature Spotlight: ${featureSpotlight.title}
${featureSpotlight.description}
Learn more: ${featureSpotlight.docUrl}
`
    : '';

  return `Monthly Usage Report
${orgName} • ${periodLabel}

Activity Summary
----------------
Total Tool Calls: ${stats.toolCalls.total.toLocaleString()}
Allowed / Denied: ${stats.toolCalls.allowed.toLocaleString()} / ${stats.toolCalls.denied.toLocaleString()}
Active Users: ${stats.activeUsers}
Active Agents: ${stats.activeAgents}
Policies Triggered: ${stats.policiesTriggered}
Peak Activity: ${peakHourText}
${featureSection}
--
Sentinel Control Plane`;
}
