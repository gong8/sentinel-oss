import { Callout } from '../../../components/Callout';

export default function AdminAnalyticsContent() {
  return (
    <>
      <h1 id="viewing-analytics">Viewing Analytics</h1>
      <p className="lead text-xl text-muted-foreground">
        Understand how AI tools are being used across your organization. Track usage patterns,
        identify trends, and make informed decisions.
      </p>

      <h2 id="analytics-overview">Analytics Overview</h2>
      <p>
        From the Admin Dashboard, click the <strong>Analytics</strong> button in the top right
        corner to access usage statistics.
      </p>

      <h2 id="key-metrics">Key Metrics</h2>
      <p>At the top, you'll see summary statistics:</p>
      <ul>
        <li>
          <strong>Total Invocations</strong> - All tool uses in the selected period
        </li>
        <li>
          <strong>Denial Rate</strong> - Percentage of tool calls that were denied (shown as a
          percentage, e.g., "12.5%")
        </li>
        <li>
          <strong>Unique Users</strong> - How many users used tools
        </li>
        <li>
          <strong>Unique Agents</strong> - How many AI agents were active
        </li>
        <li>
          <strong>Unique Tools</strong> - How many different tools were used
        </li>
      </ul>

      <h2 id="usage-chart">Usage Over Time</h2>
      <p>The main chart shows tool usage over time. You can:</p>
      <ul>
        <li>
          <strong>Change the time range</strong> - Last 24 hours, 7 days, 30 days, 90 days, or a
          custom date range
        </li>
        <li>
          <strong>Group by</strong> - Hour or day
        </li>
      </ul>
      <p>
        The chart displays total invocations along with allowed and denied counts, helping you
        visualize usage patterns and policy effectiveness.
      </p>

      <Callout type="tip" title="Spot trends">
        Look for patterns like increased usage on certain days or gradual growth over time. This
        helps you understand how AI adoption is progressing.
      </Callout>

      <h2 id="top-tools">Most Used Tools</h2>
      <p>This section ranks tools by usage. For each tool, you can see:</p>
      <ul>
        <li>Total number of invocations</li>
        <li>Allowed count</li>
        <li>Denied count</li>
      </ul>

      <p>
        Use this to understand which tools are most popular and how policies are affecting them.
      </p>

      <h2 id="top-users">Most Active Users</h2>
      <p>See which users are using AI tools the most. For each user, you can see:</p>
      <ul>
        <li>Total invocation count</li>
        <li>Allowed count</li>
        <li>Denied count</li>
      </ul>
      <p>This helps identify:</p>
      <ul>
        <li>Power users who might have feedback on improving the setup</li>
        <li>Teams that are successfully adopting AI tools</li>
        <li>Potential training opportunities for less active users</li>
      </ul>

      <h2 id="top-agents">Most Active Agents</h2>
      <p>See which AI agents are generating the most tool calls. For each agent, you can see:</p>
      <ul>
        <li>Total invocation count</li>
        <li>Allowed count</li>
        <li>Denied count</li>
      </ul>

      <h2 id="peak-hours">Peak Usage Hours</h2>
      <p>
        View a heatmap of tool usage by hour of day. This shows which hours see the most activity,
        helping you understand when your organization relies most heavily on AI tools.
      </p>

      <Callout type="info" title="Plan for peak usage">
        Understanding peak hours can help you schedule maintenance windows and ensure adequate
        resources during high-usage periods.
      </Callout>

      <h2 id="filtering">Filtering Analytics</h2>
      <p>Use the time range filter at the top of the page to focus on specific periods:</p>

      <h3>By Date Range</h3>
      <p>
        Select a preset range (24 hours, 7 days, 30 days, or 90 days) or choose a custom date range
        for specific analysis periods.
      </p>

      <h3>By Grouping</h3>
      <p>
        Choose to group data by <strong>hour</strong> for granular views or by <strong>day</strong>{' '}
        for broader trends.
      </p>
    </>
  );
}
