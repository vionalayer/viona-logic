import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListMarkets, getListMarketsQueryKey,
  useGetMarketChart, getGetMarketChartQueryKey,
} from '@workspace/api-client-react';
import { TermTable } from '@/pages/dashboard';
import { AssetLogo } from '@/components/asset-logo';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { getMarketStatus, canTradeNow } from '@/lib/market-status';

/* ── formatters ─────────────────────────────────────────────────── */
function fmt(n: number | undefined | null) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBig(n: number | undefined | null) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
function fmtVol(n: number | undefined | null) {
  if (n == null) return '—';
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}
function fmtPct(n: number | undefined | null) {
  if (n == null) return '—';
  const s = n.toFixed(2);
  return (n >= 0 ? '+' : '') + s + '%';
}

/* ── TYPE badge ─────────────────────────────────────────────────── */
const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  STOCK:    { bg: 'hsl(var(--primary) / 0.12)', text: 'hsl(var(--primary))' },
  ETF:      { bg: 'rgba(120,180,255,0.12)',      text: 'rgb(120,180,255)' },
  TREASURY: { bg: 'rgba(255,200,80,0.12)',       text: 'rgb(255,200,80)' },
};
function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLOR[type] ?? { bg: 'hsl(var(--muted) / 0.2)', text: 'hsl(var(--muted-foreground))' };
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px',
      fontSize: '8px', letterSpacing: '0.1em', fontWeight: 600,
      background: c.bg, color: c.text,
      border: `1px solid ${c.text}30`, borderRadius: '2px',
    }}>
      {type}
    </span>
  );
}

/* ── TRADING SESSION badge ──────────────────────────────────────── */
function TradingBadge({ caps, active }: {
  caps?: { market: boolean; extended: boolean; overnight: boolean } | null;
  active: boolean;
}) {
  const overnight = caps?.overnight ?? false;
  const extended  = caps?.extended  ?? false;

  const label = overnight ? '24H' : extended ? 'EXT' : 'MKT';
  const color  = overnight
    ? 'rgb(120,180,255)'
    : extended
    ? '#FFB800'
    : 'hsl(var(--muted-foreground))';

  return (
    <span
      title={
        overnight  ? 'Trades 24/7 including overnight'
        : extended ? 'Trades during pre/post market extended hours'
        :            'Regular market hours only (9:30AM–4PM ET)'
      }
      style={{
        display: 'inline-block', padding: '1px 5px',
        fontSize: '7.5px', letterSpacing: '0.12em', fontWeight: 700,
        background: `${color}18`,
        color: active ? color : 'hsl(var(--muted-foreground) / 0.45)',
        border: `1px solid ${color}40`, borderRadius: '2px',
        transition: 'opacity 0.2s',
      }}
    >
      {label}
    </span>
  );
}

/* ── MULTIPLIER badge ───────────────────────────────────────────── */
function MultiplierBadge({ multiplier }: { multiplier: number | null | undefined }) {
  if (!multiplier || multiplier === 1) return null;
  return (
    <span
      title={`Corporate action: ${multiplier}x price multiplier applied`}
      style={{
        display: 'inline-block', padding: '1px 5px',
        fontSize: '7.5px', letterSpacing: '0.1em', fontWeight: 700,
        background: 'rgba(255,184,0,0.1)', color: '#FFB800',
        border: '1px solid rgba(255,184,0,0.3)', borderRadius: '2px',
        cursor: 'help',
      }}
    >
      {multiplier}×
    </span>
  );
}

/* ── HALT badge ─────────────────────────────────────────────────── */
function HaltBadge() {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px',
      fontSize: '7.5px', letterSpacing: '0.1em', fontWeight: 700,
      background: 'rgba(239,68,68,0.12)', color: 'hsl(var(--destructive))',
      border: '1px solid rgba(239,68,68,0.3)', borderRadius: '2px',
    }}>
      HALT
    </span>
  );
}

/* ── Mini sparkline per row ─────────────────────────────────────── */
function Sparkline({ symbol, isUp }: { symbol: string; isUp: boolean }) {
  const { data: chart } = useGetMarketChart(symbol, '1d', {
    query: {
      queryKey: getGetMarketChartQueryKey(symbol, '1d'),
      staleTime: 60_000,
      refetchInterval: 120_000,
    },
  });

  const points = chart?.points ?? [];
  if (points.length < 2) return <div style={{ width: 80, height: 32 }} />;

  const color = isUp ? 'hsl(var(--success))' : 'hsl(var(--destructive))';

  return (
    <div style={{ width: 80, height: 32 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={['auto', 'auto']} hide />
          <Area
            type="monotone" dataKey="price"
            stroke={color} strokeWidth={1.5}
            fill={`url(#spark-${symbol})`}
            dot={false} isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Filters ────────────────────────────────────────────────────── */
const FILTERS = ['ALL', 'STOCK', 'ETF', 'TREASURY'] as const;

/* ── Main page ──────────────────────────────────────────────────── */
export function MarketsPage() {
  const [, navigate] = useLocation();
  const queryClient  = useQueryClient();
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch]  = useState('');
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [marketStatus, setMarketStatus] = useState(getMarketStatus());

  const { data: markets, isLoading, isFetching } = useListMarkets({
    query: { queryKey: getListMarketsQueryKey() },
  });

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
      setLastRefresh(Date.now());
      setMarketStatus(getMarketStatus());
    }, 30000);
    return () => clearInterval(id);
  }, [queryClient]);

  const filtered = markets?.filter(m => {
    const matchType = filter === 'ALL' || m.assetType === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || m.symbol.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const statusColor = marketStatus.color;
  const dotStyle: React.CSSProperties = {
    width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0,
    boxShadow: marketStatus.session === 'OPEN' ? `0 0 6px ${statusColor}` : 'none',
  };

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col gap-3">

      {/* ── Market Status Banner ─────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 border"
        style={{ borderColor: `${statusColor}30`, background: `${statusColor}08` }}
      >
        <div className="flex items-center gap-2">
          <span style={dotStyle} />
          <span style={{ fontSize: '9px', letterSpacing: '0.12em', fontWeight: 700, color: statusColor }}>
            {marketStatus.label}
          </span>
          <span style={{ fontSize: '8.5px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.06em' }}>
            — {marketStatus.description}
          </span>
        </div>
        <div className="flex items-center gap-3" style={{ fontSize: '8px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground) / 0.6)' }}>
          <span>OVERNIGHT TOKENS</span>
          <span style={{ color: 'rgb(120,180,255)', fontWeight: 700 }}>
            {markets?.filter(m => (m as any).tradingCapabilities?.overnight).length ?? 0} / {markets?.length ?? 0}
          </span>
          <span style={{ marginLeft: 4 }}>PRICES VIA YAHOO FINANCE + ROBINHOOD RHJ API</span>
        </div>
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0">

        {/* Left: title + live indicator */}
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>
            TOKENIZED ASSETS
          </span>
          <span style={{ fontSize: '9px', color: 'hsl(var(--border))' }}>·</span>
          <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'hsl(var(--foreground))' }}>
            {filtered?.length ?? 0} INSTRUMENTS
          </span>
          <div className="flex items-center gap-1" style={{ marginLeft: 4 }}>
            <span className={isFetching ? 't-dot-green t-blink' : 't-dot-green'} style={isFetching ? {} : { opacity: 0.4 }} />
            <span style={{ fontSize: '8px', letterSpacing: '0.08em', color: isFetching ? 'hsl(var(--primary) / 0.7)' : 'hsl(var(--muted-foreground) / 0.5)' }}>
              {isFetching ? 'UPDATING…' : 'LIVE · 30S'}
            </span>
          </div>
        </div>

        {/* Right: search + filters */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="SEARCH..."
            className="t-input"
            style={{ width: '150px', fontSize: '10px', letterSpacing: '0.08em', padding: '4px 8px' }}
          />
          <div className="flex border border-border">
            {FILTERS.map((f, i) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: '9px', letterSpacing: '0.1em',
                  fontFamily: 'var(--app-font-mono)',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
                  borderRight: i < FILTERS.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                  background: filter === f ? 'hsl(var(--primary) / 0.12)' : 'transparent',
                  color: filter === f ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 border border-border" style={{ background: 'hsl(var(--card))' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 border-b border-border animate-pulse" style={{ height: 52 }}>
              <div style={{ width: 24, height: 24, background: 'hsl(var(--border))', borderRadius: 2 }} />
              <div style={{ width: 60, height: 10, background: 'hsl(var(--border))', borderRadius: 2 }} />
              <div style={{ flex: 1 }} />
              <div style={{ width: 80, height: 10, background: 'hsl(var(--border))', borderRadius: 2 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <TermTable>
            <thead>
              <tr>
                <th className="t-th text-left" style={{ width: 200 }}>SYMBOL</th>
                <th className="t-th text-left">NAME</th>
                <th className="t-th text-center" style={{ width: 110 }}>1D CHART</th>
                <th className="t-th text-right" style={{ width: 100 }}>PRICE</th>
                <th className="t-th text-right" style={{ width: 110 }}>24H CHG</th>
                <th className="t-th text-right" style={{ width: 90 }}>VOLUME</th>
                <th className="t-th text-right" style={{ width: 160 }}>52W RANGE</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="t-td text-center" style={{ padding: '3rem', color: 'hsl(var(--muted-foreground))' }}>
                    NO RESULTS MATCHING YOUR CRITERIA
                  </td>
                </tr>
              ) : (
                filtered?.map(asset => {
                  const isUp = (asset.change ?? 0) >= 0;
                  const rangePos = asset.low52w && asset.high52w
                    ? Math.max(0, Math.min(100, ((asset.price - asset.low52w) / (asset.high52w - asset.low52w)) * 100))
                    : null;
                  const caps = (asset as any).tradingCapabilities as { market: boolean; extended: boolean; overnight: boolean } | null;
                  const multiplier = (asset as any).currentMultiplier as number | null;
                  const isHalt = (asset as any).isTradingHalt as boolean | false;
                  const tradeable = canTradeNow(caps, marketStatus);

                  return (
                    <tr
                      key={asset.symbol}
                      className="t-row"
                      onClick={() => navigate(`/trade?symbol=${asset.symbol}`)}
                      style={{ cursor: 'pointer', opacity: isHalt ? 0.5 : 1 }}
                    >
                      {/* Symbol + logo + badges */}
                      <td className="t-td pl-3">
                        <div className="flex items-center gap-2">
                          <AssetLogo symbol={asset.symbol} logoUrl={asset.logoUrl} size={22} />
                          <div>
                            <div style={{ fontWeight: 700, letterSpacing: '0.05em', color: 'hsl(var(--foreground))', fontSize: '12px' }}>
                              {asset.symbol}
                            </div>
                            <div className="flex items-center gap-1" style={{ marginTop: 2 }}>
                              <TypeBadge type={asset.assetType} />
                              <TradingBadge caps={caps} active={tradeable} />
                              <MultiplierBadge multiplier={multiplier} />
                              {isHalt && <HaltBadge />}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="t-td" style={{ color: 'hsl(var(--muted-foreground))', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>
                        {asset.name}
                      </td>

                      {/* Sparkline */}
                      <td className="t-td" style={{ padding: '6px 8px' }}>
                        <div className="flex justify-center">
                          <Sparkline symbol={asset.symbol} isUp={isUp} />
                        </div>
                      </td>

                      {/* Price */}
                      <td className="t-td text-right t-num" style={{ fontWeight: 700, fontSize: '13px', color: 'hsl(var(--foreground))' }}>
                        {fmt(asset.price)}
                      </td>

                      {/* 24H change */}
                      <td className="t-td text-right">
                        <div className="t-num" style={{
                          fontSize: '12px', fontWeight: 600,
                          color: isUp ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
                        }}>
                          {fmtPct(asset.changePercent)}
                        </div>
                        <div className="t-num" style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))' }}>
                          {isUp ? '+' : ''}{fmt(asset.change)}
                        </div>
                      </td>

                      {/* Volume */}
                      <td className="t-td text-right t-num" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '11px' }}>
                        {fmtVol(asset.volume)}
                      </td>

                      {/* 52W range */}
                      <td className="t-td pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="t-num" style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', width: 32, textAlign: 'right', flexShrink: 0 }}>
                            {asset.low52w?.toFixed(0) ?? '—'}
                          </span>
                          <div style={{ flex: 1, height: '3px', background: 'hsl(var(--border))', position: 'relative', borderRadius: 2 }}>
                            {rangePos != null && (
                              <div style={{
                                position: 'absolute',
                                left: `${Math.max(2, Math.min(94, rangePos))}%`,
                                top: '-2px', width: '7px', height: '7px',
                                background: 'hsl(var(--primary))', borderRadius: '50%',
                                transform: 'translateX(-50%)',
                              }} />
                            )}
                          </div>
                          <span className="t-num" style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', width: 32, flexShrink: 0 }}>
                            {asset.high52w?.toFixed(0) ?? '—'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TermTable>
        </div>
      )}

      {/* Footer: last refresh */}
      <div className="flex-shrink-0 flex items-center gap-1.5" style={{ fontSize: '8px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground) / 0.4)' }}>
        <span>LAST UPDATED</span>
        <span className="t-num">{new Date(lastRefresh).toLocaleTimeString()}</span>
        <span>·</span>
        <span>CLICK ANY ROW TO TRADE</span>
        <span>·</span>
        <span>BADGES: <span style={{ color: 'rgb(120,180,255)' }}>24H</span> = overnight, <span style={{ color: '#FFB800' }}>EXT</span> = extended hours, <span style={{ color: 'hsl(var(--muted-foreground))' }}>MKT</span> = market hours only</span>
      </div>
    </div>
  );
}
