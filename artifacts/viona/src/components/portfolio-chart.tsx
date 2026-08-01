import React, { useState } from 'react';
import { useGetPortfolioPerformance, getGetPortfolioPerformanceQueryKey } from '@workspace/api-client-react';
import { Area, AreaChart, ResponsiveContainer, YAxis, Tooltip, XAxis } from 'recharts';
import { formatCurrency, formatPercent } from './formatters';

export function PortfolioChart({ range = '30d', mini = false }: { range?: string, mini?: boolean }) {
  const { data: perf } = useGetPortfolioPerformance(range, {
    query: { queryKey: getGetPortfolioPerformanceQueryKey(range) }
  });

  if (!perf || perf.points.length === 0) {
    return <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">No chart data</div>;
  }

  const isPositive = perf.changePercent >= 0;
  const color = isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))';

  if (mini) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={perf.points}>
          <defs>
            <linearGradient id={`gradient-${range}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={['auto', 'auto']} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fillOpacity={1}
            fill={`url(#gradient-${range})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="w-full h-full" style={{ minHeight: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={perf.points} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-full-${range}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="date" 
            tickFormatter={(val) => {
              const d = new Date(val);
              return range === '1d' ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }}
            stroke="hsl(var(--border))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            minTickGap={30}
          />
          <YAxis 
            domain={['auto', 'auto']} 
            tickFormatter={(val) => '$' + (val >= 1000 ? (val/1000).toFixed(1) + 'k' : val)}
            stroke="hsl(var(--border))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            width={60}
          />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-card border border-border shadow-lg rounded-sm p-3 text-sm">
                    <div className="text-muted-foreground mb-1">{new Date(payload[0].payload.date).toLocaleString()}</div>
                    <div className="font-mono-tabular font-semibold text-foreground text-lg">
                      {formatCurrency(payload[0].value as number)}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fillOpacity={1}
            fill={`url(#gradient-full-${range})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
