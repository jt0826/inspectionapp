import React, { useEffect, useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, BarChart3, Users, Building2, Activity } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Popover from '@radix-ui/react-popover';
import * as Progress from '@radix-ui/react-progress';
import * as Separator from '@radix-ui/react-separator';
import { getDashboardMetrics } from '../utils/inspectionApi';
import NumberFlow from '@number-flow/react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';

interface DashboardProps {
  onBack: () => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function Dashboard({ onBack }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [chartData30d, setChartData30d] = useState<any[]>([]);
  const [venueChartData, setVenueChartData] = useState<any[]>([]);
  const [inspectorChartData, setInspectorChartData] = useState<any[]>([]);
  const [qualityTrend, setQualityTrend] = useState<'up' | 'down' | 'stable'>('stable');

  useEffect(() => {
    (async () => {
      try {
        const data = await getDashboardMetrics(30);
        if (!data) return;

        setMetrics(data.metrics);
        
        // 30-day completion trend
        if (data.completionTrend30d) {
          const now = new Date();
          const chart = data.completionTrend30d.map((count: number, idx: number) => {
            const date = new Date(now);
            date.setDate(date.getDate() - (29 - idx));
            return {
              day: `${date.getMonth() + 1}/${date.getDate()}`,
              completions: count
            };
          });
          setChartData30d(chart);
        }

        // Venue analytics
        if (data.venueAnalytics) {
          setVenueChartData(data.venueAnalytics.slice(0, 8).map((v: any) => ({
            venue: v.venue.length > 20 ? v.venue.substring(0, 20) + '...' : v.venue,
            failRate: Number((v.failRate * 100).toFixed(1)),
            inspections: v.inspections
          })));
        }

        // Inspector performance
        if (data.inspectorPerformance) {
          setInspectorChartData(data.inspectorPerformance.slice(0, 6).map((i: any) => ({
            name: i.inspector.length > 15 ? i.inspector.substring(0, 15) + '...' : i.inspector,
            completed: i.completed,
            passRate: Number((i.passRate * 100).toFixed(1))
          })));
        }

        // Quality trend
        const last7 = (data.recentCompleted || []).slice(-7);
        const last3 = last7.slice(4, 7).reduce((s: number, n: number) => s + n, 0);
        const prev4 = last7.slice(0, 4).reduce((s: number, n: number) => s + n, 0);
        if (last3 > prev4 * 0.75) setQualityTrend('up');
        else if (last3 < prev4 * 0.75 && prev4 > 0) setQualityTrend('down');
        
      } catch (e) {
        console.error('Failed to load dashboard', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const passRate = metrics?.failRate != null ? (1 - metrics.failRate) * 100 : 0;
  const completionRate = metrics?.totalInspections > 0 ? (metrics.completed / metrics.totalInspections) * 100 : 0;

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
            {qualityTrend === 'up' && (
              <div className="hidden lg:flex items-center gap-2 bg-green-500/20 px-4 py-2 rounded-lg border border-green-300">
                <TrendingUp className="w-5 h-5 text-green-200" />
                <span className="text-sm text-green-100">Quality trending up</span>
              </div>
            )}
            {qualityTrend === 'down' && (
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
                <Tabs.Trigger value="analytics" className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                  Analytics
                </Tabs.Trigger>
                <Tabs.Trigger value="performance" className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                  Team
                </Tabs.Trigger>
              </Tabs.List>
            </div>

            {/* Overview Tab */}
            <Tabs.Content value="overview" className="space-y-6">
              {/* KPIs */}
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
                        style={{ width: `${completionRate}%` }}
                      />
                    </Progress.Root>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{completionRate.toFixed(0)}%</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 border-0 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow text-white">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold uppercase tracking-wide opacity-90">Quality Score</div>
                    <Activity className="w-5 h-5 opacity-90" />
                  </div>
                  <div className="text-3xl font-bold">
                    {passRate.toFixed(1)}%
                  </div>
                  <div className="mt-2 text-xs opacity-80">Pass rate across completions</div>
                </div>
              </div>

              {/* Large Chart: 30-Day Completion Trend */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Completion Volume (Last 30 Days)
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData30d}>
                    <defs>
                      <linearGradient id="colorCompletions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      labelStyle={{ fontWeight: 600, color: '#374151' }}
                    />
                    <Area type="monotone" dataKey="completions" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCompletions)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Tabs.Content>

            {/* Analytics Tab */}
            <Tabs.Content value="analytics" className="space-y-6">
              {/* Venue Risk Analysis */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Venue Risk Analysis (Failure Rates)
                </h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={venueChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#6b7280" fontSize={12} unit="%" />
                    <YAxis dataKey="venue" type="category" stroke="#6b7280" fontSize={11} width={150} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      formatter={(value: any) => [`${value}%`, 'Fail Rate']}
                    />
                    <Bar dataKey="failRate" radius={[0, 8, 8, 0]}>
                      {venueChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.failRate > 30 ? '#ef4444' : entry.failRate > 15 ? '#f59e0b' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 flex gap-4 text-xs justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-gray-600">Critical (&gt;30%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <span className="text-gray-600">Monitoring (15-30%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-gray-600">Healthy (&lt;15%)</span>
                  </div>
                </div>
              </div>

              {/* Quality Distribution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Inspection Status</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Completed', value: metrics?.completed || 0 },
                          { name: 'In Progress', value: metrics?.ongoing || 0 }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Key Metrics</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Overall Pass Rate</span>
                      <span className="text-lg font-bold text-green-600">{passRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Completion Rate</span>
                      <span className="text-lg font-bold text-blue-600">{completionRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Total Images</span>
                      <span className="text-lg font-bold text-indigo-600">{metrics?.imagesCount || 0}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Active Inspections</span>
                      <span className="text-lg font-bold text-amber-600">{metrics?.ongoing || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Tabs.Content>

            {/* Team Performance Tab */}
            <Tabs.Content value="performance" className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Inspector Performance
                </h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={inspectorChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={11} angle={-15} textAnchor="end" height={80} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="completed" fill="#3b82f6" name="Completed" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="passRate" fill="#10b981" name="Pass Rate %" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Inspector Details Table */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Detailed Inspector Metrics</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Inspector</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Completed</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Pass Rate</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectorChartData.map((inspector, idx) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm text-gray-800">{inspector.name}</td>
                          <td className="py-3 px-4 text-sm text-gray-800 text-right">{inspector.completed}</td>
                          <td className="py-3 px-4 text-sm text-gray-800 text-right">{inspector.passRate}%</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              inspector.passRate >= 90 ? 'bg-green-100 text-green-800' :
                              inspector.passRate >= 70 ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {inspector.passRate >= 90 ? 'Excellent' : inspector.passRate >= 70 ? 'Good' : 'Needs Improvement'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
