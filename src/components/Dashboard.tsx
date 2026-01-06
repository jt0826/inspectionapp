import React, { useEffect, useState } from 'react';
import { ArrowLeft, Grid, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, BarChart3, Users, Building2, Camera, Activity } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Popover from '@radix-ui/react-popover';
import * as Progress from '@radix-ui/react-progress';
import * as Separator from '@radix-ui/react-separator';
import { getInspectionsPartitioned, getDashboardMetrics } from '../utils/inspectionApi';
import NumberFlow from '@number-flow/react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart } from 'recharts';

interface DashboardProps {
  onBack: () => void;
}

type Metrics = {
  totalInspections: number;
  ongoing: number;
  completed: number;
  recentCompleted: number[]; // counts per day for last N days
  passRate?: number;
  avgCompletionTime?: number;
  topIssues?: Array<{ issue: string; count: number }>;
  inspectorPerformance?: Array<{ name: string; completed: number; passRate: number }>;
  venueRiskScores?: Array<{ venueName: string; failRate: number; totalFails: number }>;
};

export function Dashboard({ onBack }: DashboardProps) {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentList, setRecentList] = useState<any[]>([]);
  const [venueStats, setVenueStats] = useState<Array<{ venueName: string; failRate: number; totalFails: number; totalItems: number }>>([]);
  const [inspectorStats, setInspectorStats] = useState<Array<{ name: string; completed: number; passRate: number; avgTime: string }>>([]);
  const [trendData, setTrendData] = useState<{ completionRate: number; qualityTrend: 'up' | 'down' | 'stable' }>({ completionRate: 0, qualityTrend: 'stable' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Prefer server-side authoritative dashboard metrics
        const srv = await getDashboardMetrics(7);
        if (srv && srv.metrics) {
          if (!cancelled) {
            setMetrics({
              totalInspections: Number(srv.metrics.totalInspections || 0),
              ongoing: Number(srv.metrics.ongoing || 0),
              completed: Number(srv.metrics.completed || 0),
              recentCompleted: Array.isArray(srv.recentCompleted) ? srv.recentCompleted : Array(7).fill(0),
              passRate: srv.metrics.failRate != null ? (1 - srv.metrics.failRate) : undefined,
            });
            setRecentList(srv.recentInspections || []);
          }
        } else {
          // fallback: compute client-side from existing partitioned query
          const body = await getInspectionsPartitioned();
          if (!body) {
            if (!cancelled) setLoading(false);
            return;
          }

          const all: any[] = [];
          if (Array.isArray(body.inspections)) all.push(...body.inspections);
          if (Array.isArray(body.completed)) all.push(...body.completed);
          if (Array.isArray(body.ongoing)) all.push(...body.ongoing);

          const uniqueIds = new Set(all.map((i) => String(i.inspection_id || i.id || '')).filter(Boolean));
          const totalInspections = uniqueIds.size;
          const ongoing = Array.isArray(body.ongoing) ? body.ongoing.length : all.filter((i) => String(i.status || '').toLowerCase() !== 'completed').length;
          const completedArr = Array.isArray(body.completed) ? body.completed : all.filter((i) => String(i.status || '').toLowerCase() === 'completed');
          const completed = completedArr.length;

          // Build recent 7 days completed counts
          const bucket: number[] = Array(7).fill(0);
          const now = new Date();
          completedArr.forEach((c: any) => {
            const ts = new Date(c.completedAt || c.timestamp || c.updatedAt || c.updated_at || null);
            if (!ts || isNaN(ts.getTime())) return;
            const diff = Math.floor((now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24));
            if (diff >= 0 && diff < 7) {
              bucket[6 - diff] += 1; // so index 6 is today
            }
          });

          // Compute pass rate across all completed inspections
          let totalItems = 0, totalPasses = 0;
          completedArr.forEach((ins: any) => {
            const t = ins.totals;
            if (t && typeof t.total === 'number') {
              totalItems += t.total || 0;
              totalPasses += t.pass || 0;
            }
          });
          const passRate = totalItems > 0 ? totalPasses / totalItems : undefined;

          // Compute venue risk scores (venues with most failures)
          const venueMap: Record<string, { fails: number; total: number }> = {};
          all.forEach((ins: any) => {
            const vname = String(ins.venueName || ins.venue_name || 'Unknown');
            const t = ins.totals;
            if (t && typeof t.total === 'number') {
              if (!venueMap[vname]) venueMap[vname] = { fails: 0, total: 0 };
              venueMap[vname].fails += t.fail || 0;
              venueMap[vname].total += t.total || 0;
            }
          });
          const venueRisk = Object.entries(venueMap)
            .map(([venueName, data]) => ({
              venueName,
              failRate: data.total > 0 ? data.fails / data.total : 0,
              totalFails: data.fails,
              totalItems: data.total
            }))
            .sort((a, b) => b.failRate - a.failRate)
            .slice(0, 5);

          // Compute inspector performance
          const inspectorMap: Record<string, { completed: number; totalItems: number; totalPasses: number; times: number[] }> = {};
          completedArr.forEach((ins: any) => {
            const iname = String(ins.createdBy || ins.created_by || ins.updatedBy || ins.updated_by || 'Unknown');
            const t = ins.totals;
            if (!inspectorMap[iname]) inspectorMap[iname] = { completed: 0, totalItems: 0, totalPasses: 0, times: [] };
            inspectorMap[iname].completed += 1;
            if (t && typeof t.total === 'number') {
              inspectorMap[iname].totalItems += t.total || 0;
              inspectorMap[iname].totalPasses += t.pass || 0;
            }
            // Try to compute time if we have both start and end timestamps
            const created = new Date(ins.timestamp || ins.createdAt || ins.created_at);
            const completed = new Date(ins.completedAt || ins.completed_at || ins.updatedAt || ins.updated_at);
            if (!isNaN(created.getTime()) && !isNaN(completed.getTime()) && completed > created) {
              const hours = (completed.getTime() - created.getTime()) / (1000 * 60 * 60);
              if (hours > 0 && hours < 24 * 7) inspectorMap[iname].times.push(hours); // reasonable range
            }
          });
          const inspectorPerf = Object.entries(inspectorMap)
            .map(([name, data]) => ({
              name,
              completed: data.completed,
              passRate: data.totalItems > 0 ? data.totalPasses / data.totalItems : 0,
              avgTime: data.times.length > 0 ? `${(data.times.reduce((s, t) => s + t, 0) / data.times.length).toFixed(1)}h` : '—'
            }))
            .sort((a, b) => b.completed - a.completed)
            .slice(0, 5);

          // Compute trend: compare last 3 days vs previous 4 days
          const last3 = bucket.slice(4, 7).reduce((s, n) => s + n, 0);
          const prev4 = bucket.slice(0, 4).reduce((s, n) => s + n, 0);
          const completionRate = completed > 0 ? (completed / totalInspections) * 100 : 0;
          let qualityTrend: 'up' | 'down' | 'stable' = 'stable';
          if (last3 > prev4 * 0.75) qualityTrend = 'up';
          else if (last3 < prev4 * 0.75 && prev4 > 0) qualityTrend = 'down';

          if (!cancelled) {
            setMetrics({ totalInspections, ongoing, completed, recentCompleted: bucket, passRate });
            setVenueStats(venueRisk);
            setInspectorStats(inspectorPerf);
            setTrendData({ completionRate, qualityTrend });
            const sorted = (completedArr || []).slice().sort((a: any, b: any) => new Date(String(b.completedAt || b.timestamp || b.updatedAt || '')).getTime() - new Date(String(a.completedAt || a.timestamp || a.updatedAt || '')).getTime()).slice(0,6);
            setRecentList(sorted);
          }
        }

      } catch (e) {
        console.warn('Failed to load dashboard metrics', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 lg:p-8 shadow-lg">
          <button onClick={onBack} className="flex items-center gap-2 text-white hover:opacity-90 mb-4 lg:mb-6 text-sm lg:text-base transition-opacity">
            <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6" />
            <span>Back to Home</span>
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 lg:gap-4">
              <BarChart3 className="w-10 h-10 lg:w-12 lg:h-12" />
              <div>
                <h1 className="text-2xl lg:text-4xl font-bold">Business Dashboard</h1>
                <p className="text-blue-100 text-sm lg:text-base">Real-time inspection performance & insights</p>
              </div>
            </div>
            {trendData.qualityTrend === 'up' && (
              <div className="hidden lg:flex items-center gap-2 bg-green-500/20 px-4 py-2 rounded-lg border border-green-300">
                <TrendingUp className="w-5 h-5 text-green-200" />
                <span className="text-sm text-green-100">Quality trending up</span>
              </div>
            )}
            {trendData.qualityTrend === 'down' && (
              <div className="hidden lg:flex items-center gap-2 bg-amber-500/20 px-4 py-2 rounded-lg border border-amber-300">
                <TrendingDown className="w-5 h-5 text-amber-200" />
                <span className="text-sm text-amber-100">Needs attention</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 lg:p-8">
          <Tabs.Root defaultValue="overview" className="w-full">
            <div className="flex items-center justify-between mb-6">
              <Tabs.List className="flex gap-2 bg-white p-1 rounded-lg shadow-sm border" aria-label="Dashboard Tabs">
                <Tabs.Trigger value="overview" className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                  Overview
                </Tabs.Trigger>
                <Tabs.Trigger value="performance" className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                  Performance
                </Tabs.Trigger>
                <Tabs.Trigger value="risk" className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                  Risk Analysis
                </Tabs.Trigger>
              </Tabs.List>

              <Popover.Root>
                <Popover.Trigger className="px-4 py-2 rounded-lg bg-white border shadow-sm text-gray-700 text-sm hover:bg-gray-50 transition-colors">
                  Options
                </Popover.Trigger>
                <Popover.Content className="p-4 bg-white border rounded-lg shadow-xl z-50" sideOffset={5}>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-500 mb-3">DASHBOARD OPTIONS</div>
                    <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm text-gray-700">Export Report</button>
                    <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm text-gray-700">Refresh Data</button>
                    <Separator.Root className="bg-gray-200 h-[1px] my-2" />
                    <button className="w-ful-3 py-2 rounded hover:bg-gray-100 text-sm text-gray-700">Settings</button>
                  </div>
                </Popover.Content>
              </Popover.Root>
            </div>

            {/* Overview Tab */}
            <Tabs.Content value="overview" className="space-y-6">
              {/* Key Performance Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Inspections</div>
                    <Building2 className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    <NumberFlow value={metrics?.totalInspections ?? 0} />
                  </div>
                  <div className="mt-2 text-xs text-gray-500">All-time total</div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">In Progress</div>
                    <Clock className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    <NumberFlow value={metrics?.ongoing ?? 0} />
                  </div>
                  <div className="mt-2 text-xs text-gray-500">Active now</div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Completed</div>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    <NumberFlow value={metrics?.completed ?? 0} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress.Root className="relative h-1 w-full overflow-hidden rounded-full bg-gray-200">
                      <Progress.Indicator
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{ width: `${trendData.completionRate}%` }}
                      />
                    </Progress.Root>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{trendData.completionRate.toFixed(0)}%</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 border-0 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow text-white">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Quality Score</div>
                    <TrendingUp className="w-5 h-5 opacity-90" />
                  </div>
                  <div className="text-3xl font-bold">
                    {metrics?.passRate != null ? `${(metrics.passRate * 100).toFixed(1)}%` : '—'}
                  </div>
                  <div className="mt-2 text-xs opacity-80">Pass rate across completions</div>
                </div>
              </div>

              {/* Completion Trend Chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Completions Trend (Last 7 Days)
                </h3>
                <div className="flex gap-3 items-end h-40">
                  {metrics ? metrics.recentCompleted.map((count, i) => {
                    const max = Math.max(...metrics.recentCompleted, 1);
                    const heightPct = (count / max) * 100;
                    const dayLabels = ['6d ago', '5d ago', '4d ago', '3d ago', '2d ago', 'Yesterday', 'Today'];
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div className="relative w-full bg-gradient-to-t from-indigo-500 to-indigo-300 rounded-t-lg transition-all hover:from-indigo-600 hover:to-indigo-400" style={{ height: `${heightPct}%`, minHeight: count > 0 ? '8px' : '2px' }}>
                          {count > 0 && (
                            <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-gray-700">{count}</div>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 text-center">{dayLabels[i]}</div>
                      </div>
                    );
                  }) : <div className="text-sm text-gray-400">Loading…</div>}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Recent Completed Inspections
                </h3>
                <div className="space-y-3">
                  {recentList.length === 0 && <div className="text-sm text-gray-400 py-4 text-center">No recent completions</div>}
                  {recentList.slice(0, 6).map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{r.venueName || r.venue_name || 'Unknown Venue'}</div>
                        <div className="text-xs text-gray-500">{r.roomName || r.room_name || 'Unknown Room'}</div>
                      </div>
                      <div className="text-xs text-gray-500">{new Date(r.completedAt || r.timestamp || r.updatedAt || '').toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Tabs.Content>

            {/* Performance Tab */}
            <Tabs.Content value="performance" className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Inspector Performance
                </h3>
                <div className="space-y-3">
                  {inspectorStats.length === 0 && <div className="text-sm text-gray-400 py-4 text-center">No inspector data available</div>}
                  {inspectorStats.map((insp, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                          {insp.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{insp.name}</div>
                          <div className="text-xs text-gray-500">{insp.completed} completed • Avg: {insp.avgTime}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Pass Rate</div>
                          <div className="text-sm font-semibold text-gray-800">{(insp.passRate * 100).toFixed(1)}%</div>
                        </div>
                        <div className="w-16">
                          <Progress.Root className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
                            <Progress.Indicator
                              className={`h-full transition-all duration-300 ${insp.passRate >= 0.9 ? 'bg-green-500' : insp.passRate >= 0.7 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${insp.passRate * 100}%` }}
                            />
                          </Progress.Root>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Tabs.Content>

            {/* Risk Analysis Tab */}
            <Tabs.Content value="risk" className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  High-Risk Venues (Most Failures)
                </h3>
                <div className="space-y-3">
                  {venueStats.length === 0 && <div className="text-sm text-gray-400 py-4 text-center">No venue data available</div>}
                  {venueStats.map((venue, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-red-200 transition-colors">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${venue.failRate > 0.3 ? 'bg-gradient-to-br from-red-500 to-red-600' : venue.failRate > 0.15 ? 'bg-gradient-to-br from-amber-500 to-amber-600' : 'bg-gradient-to-br from-green-500 to-green-600'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{venue.venueName}</div>
                          <div className="text-xs text-gray-500">{venue.totalFails} failures out of {venue.totalItems} items</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Fail Rate</div>
                          <div className={`text-sm font-semibold ${venue.failRate > 0.3 ? 'text-red-600' : venue.failRate > 0.15 ? 'text-amber-600' : 'text-green-600'}`}>
                            {(venue.failRate * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="w-16">
                          <Progress.Root className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
                            <Progress.Indicator
                              className={`h-full transition-all duration-300 ${venue.failRate > 0.3 ? 'bg-red-500' : venue.failRate > 0.15 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${venue.failRate * 100}%` }}
                            />
                          </Progress.Root>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <div className="text-xs font-semibold text-red-800 uppercase">Critical</div>
                  </div>
                  <div className="text-2xl font-bold text-red-900">
                    {venueStats.filter(v => v.failRate > 0.3).length}
                  </div>
                  <div className="text-xs text-red-700 mt-1">Venues need attention</div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <div className="text-xs font-semibold text-amber-800 uppercase">Monitoring</div>
                  </div>
                  <div className="text-2xl font-bold text-amber-900">
                    {venueStats.filter(v => v.failRate > 0.15 && v.failRate <= 0.3).length}
                  </div>
                  <div className="text-xs text-amber-700 mt-1">Venues under watch</div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div className="text-xs font-semibold text-green-800 uppercase">Healthy</div>
                  </div>
                  <div className="text-2xl font-bold text-green-900">
                    {venueStats.filter(v => v.failRate <= 0.15).length}
                  </div>
                  <div className="text-xs text-green-700 mt-1">Venues performing well</div>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
