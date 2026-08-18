import { useMemo, useState } from 'react';
import type { TooltipProps } from 'recharts';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AdminLayout } from '../../components/layout/AdminLayout';
import { PageHeader } from '../../components/layout/PageHeader';
import { AlertDialog } from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useMcpServers } from '../../hooks/useMcpServers';
import { trpc } from '../../lib/trpc';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24, interval: 'hour' as const },
  '7d': { label: 'Last 7 days', hours: 24 * 7, interval: 'day' as const },
  '30d': { label: 'Last 30 days', hours: 24 * 30, interval: 'day' as const },
  custom: { label: 'Custom range', hours: 0, interval: 'day' as const },
};

type TimeRangeKey = keyof typeof TIME_RANGES;
function isTimeRangeKey(value: string): value is TimeRangeKey {
  return value in TIME_RANGES;
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState<keyof typeof TIME_RANGES>('7d');
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [activeCustomRange, setActiveCustomRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const range = TIME_RANGES[timeRange];
  const endDate = useMemo(() => {
    if (timeRange === 'custom' && activeCustomRange) {
      return activeCustomRange.end;
    }
    return new Date();
  }, [timeRange, activeCustomRange]);

  const startDate = useMemo(() => {
    if (timeRange === 'custom' && activeCustomRange) {
      return activeCustomRange.start;
    }
    return new Date(endDate.getTime() - range.hours * 60 * 60 * 1000);
  }, [endDate, range.hours, timeRange, activeCustomRange]);

  const summaryQuery = trpc.admin.analytics.summary.useQuery({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const timeSeriesQuery = trpc.admin.analytics.toolUsageTimeSeries.useQuery({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    interval: range.interval,
  });

  const topUsersQuery = trpc.admin.analytics.topUsers.useQuery({
    limit: 10,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const topAgentsQuery = trpc.admin.analytics.topAgents.useQuery({
    limit: 10,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const topToolsQuery = trpc.admin.analytics.topTools.useQuery({
    limit: 10,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const peakHoursQuery = trpc.admin.analytics.peakUsageHours.useQuery({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const { formatToolNameFriendly } = useMcpServers();

  const summary = summaryQuery.data;
  const timeSeries = timeSeriesQuery.data || [];
  const topUsers = topUsersQuery.data || [];
  const topAgents = topAgentsQuery.data || [];
  const topTools = topToolsQuery.data || [];
  const peakHours = peakHoursQuery.data || [];

  // Format tool names for display in chart
  const formattedTopTools = topTools.map((tool) => ({
    ...tool,
    formattedToolName: formatToolNameFriendly(tool.toolName),
  }));

  // Format time series data for chart
  const chartData = timeSeries.map((point) => ({
    timestamp: new Date(point.timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(range.interval === 'hour' ? { hour: 'numeric' } : {}),
    }),
    Allowed: point.allowed,
    Denied: point.denied,
    Total: point.count,
  }));

  const maxHourCount = Math.max(...peakHours.map((p) => p.count), 1);

  // Get color for heatmap cell - uses primary color with varying opacity
  const getHeatmapColor = (count: number) => {
    if (count === 0) return 'hsl(var(--muted))';
    const intensity = count / maxHourCount;
    if (intensity < 0.25) return 'hsl(var(--primary) / 0.2)';
    if (intensity < 0.5) return 'hsl(var(--primary) / 0.4)';
    if (intensity < 0.75) return 'hsl(var(--primary) / 0.6)';
    return 'hsl(var(--primary) / 0.85)';
  };

  const topToolsTooltipFormatter: NonNullable<TooltipProps<number, string>['formatter']> = (
    value,
  ) => [value ?? 0, 'Invocations'];

  const handleApplyCustomRange = () => {
    if (!customStartDate || !customEndDate) return;

    const start = new Date(customStartDate);
    const end = new Date(customEndDate);
    end.setHours(23, 59, 59, 999); // Set to end of day

    if (start > end) {
      setValidationError('Start date must be before end date');
      return;
    }

    setActiveCustomRange({ start, end });
    setTimeRange('custom');
    setCustomDialogOpen(false);
  };

  const handleClearCustomRange = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setActiveCustomRange(null);
    if (timeRange === 'custom') {
      setTimeRange('7d');
    }
    setCustomDialogOpen(false);
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const formatDateRangeDisplay = (start: Date, end: Date) => {
    const formatOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined,
    };

    const startStr = start.toLocaleDateString(undefined, formatOptions);
    const endStr = end.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `${startStr} - ${endStr}`;
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Usage Analytics"
            description="Insights into tool usage, user activity, and policy enforcement."
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCustomDialogOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Custom range
            </Button>
            <div className="w-48">
              <Label className="sr-only">Time Range</Label>
              <Select
                value={timeRange}
                onValueChange={(v) => {
                  if (isTimeRangeKey(v)) {
                    setTimeRange(v);
                  }
                }}
              >
                <SelectTrigger>
                  {timeRange === 'custom' && activeCustomRange ? (
                    <span className="text-sm">
                      {formatDateRangeDisplay(activeCustomRange.start, activeCustomRange.end)}
                    </span>
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIME_RANGES)
                    .filter(([key]) => key !== 'custom')
                    .map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Custom Date Range</DialogTitle>
              <DialogDescription>
                Select a custom date range for analytics data.
                {activeCustomRange && (
                  <span className="mt-2 block text-xs">
                    Current: {formatDateForInput(activeCustomRange.start)} to{' '}
                    {formatDateForInput(activeCustomRange.end)}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  max={customEndDate || formatDateForInput(new Date())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  min={customStartDate}
                  max={formatDateForInput(new Date())}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={handleClearCustomRange}
                className="text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
              <Button
                onClick={handleApplyCustomRange}
                disabled={!customStartDate || !customEndDate}
              >
                Apply Range
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={validationError !== null}
          onOpenChange={(open) => !open && setValidationError(null)}
          title="Invalid Date Range"
          description={validationError ?? ''}
          variant="destructive"
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Invocations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryQuery.isPending ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{summary?.totalInvocations || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Denial Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryQuery.isPending ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {summary?.denialRate ? summary.denialRate.toFixed(1) : '0.0'}%
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryQuery.isPending ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{summary?.uniqueUsers || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tools Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryQuery.isPending ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{summary?.uniqueTools || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tool Invocations Over Time</CardTitle>
            <CardDescription>Track tool usage patterns and identify trends.</CardDescription>
          </CardHeader>
          <CardContent>
            {timeSeriesQuery.isPending ? (
              <Skeleton className="h-80 w-full" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="timestamp" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    labelStyle={{
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Allowed"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                  <Line type="monotone" dataKey="Denied" stroke="hsl(0 84% 60%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                No data available for this time range
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Users by Invocations</CardTitle>
              <CardDescription>Users with the highest tool usage.</CardDescription>
            </CardHeader>
            <CardContent>
              {topUsersQuery.isPending ? (
                <Skeleton className="h-64 w-full" />
              ) : topUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Allowed</TableHead>
                      <TableHead className="text-right">Denied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topUsers.map((user) => (
                      <TableRow key={user.userId}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {user.invocationCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {user.allowedCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {user.deniedCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No user activity in this time range
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Agents by Invocations</CardTitle>
              <CardDescription>Agents with the highest tool usage.</CardDescription>
            </CardHeader>
            <CardContent>
              {topAgentsQuery.isPending ? (
                <Skeleton className="h-64 w-full" />
              ) : topAgents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Allowed</TableHead>
                      <TableHead className="text-right">Denied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topAgents.map((agent) => (
                      <TableRow key={agent.agentId}>
                        <TableCell className="font-medium">{agent.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {agent.invocationCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {agent.allowedCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {agent.deniedCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No agent activity in this time range
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top Tools by Invocations</CardTitle>
            <CardDescription>Most frequently invoked tools in your organization.</CardDescription>
          </CardHeader>
          <CardContent>
            {topToolsQuery.isPending ? (
              <Skeleton className="h-80 w-full" />
            ) : formattedTopTools.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height={Math.max(300, formattedTopTools.length * 40)}
              >
                <BarChart data={formattedTopTools} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis
                    dataKey="formattedToolName"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    width={200}
                    tick={(props) => {
                      const { x, y, payload } = props;
                      const maxLength = 30;
                      const text = payload.value || '';
                      const displayText =
                        text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill="hsl(var(--muted-foreground))"
                            fontSize={11}
                          >
                            <title>{text}</title>
                            {displayText}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    labelStyle={{
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={topToolsTooltipFormatter}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                  />
                  <Bar dataKey="invocationCount" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                No tool usage in this time range
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Peak Usage Hours</CardTitle>
            <CardDescription>
              Heatmap showing when tools are most frequently invoked (24-hour view).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {peakHoursQuery.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : peakHours.length > 0 ? (
              <>
                <div className="flex gap-1">
                  {peakHours.map((point) => (
                    <div
                      key={point.hour}
                      className="group relative flex-1 rounded transition-all hover:scale-110 hover:z-10"
                      style={{
                        backgroundColor: getHeatmapColor(point.count),
                        minHeight: '48px',
                      }}
                      title={`${point.hour}:00 - ${point.count} invocations`}
                    >
                      <div className="absolute -top-14 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-lg group-hover:block">
                        <div className="font-medium">{point.hour}:00</div>
                        <div className="text-[10px] opacity-75">{point.count} events</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>23:00</span>
                </div>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <span className="text-xs text-muted-foreground">Less</span>
                  <div className="flex gap-1">
                    <div className="h-4 w-4 rounded border border-border bg-muted" />
                    <div className="h-4 w-4 rounded border border-border bg-primary/20" />
                    <div className="h-4 w-4 rounded border border-border bg-primary/40" />
                    <div className="h-4 w-4 rounded border border-border bg-primary/60" />
                    <div className="h-4 w-4 rounded border border-border bg-primary/85" />
                  </div>
                  <span className="text-xs text-muted-foreground">More</span>
                </div>
              </>
            ) : (
              <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
                No activity data available for heatmap
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
