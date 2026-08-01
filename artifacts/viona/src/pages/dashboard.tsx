import React, { useEffect } from 'react';
import { getMarketStatus } from '@/lib/market-status';
import { AssetLogo } from '@/components/asset-logo';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetMarketMovers, getGetMarketMoversQueryKey,
} from '@workspace/api-client-react';
import { formatPercent } from '@/components/formatters';
import { Link, useLocation } from 'wouter';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useOnChainBalances } from '@/lib/use-onchain-balances';

/* ── Formatters ───────────────────────────────────────────────── */
function fmt(n: number | undefined | null) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtEth(wei: bigint) {
  return (Number(wei) / 1e18).toFixed(6);
}
function fmtUsdg(raw: bigint) {
  return (Number(raw) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Re-export TermTable for other pages ─────────────────────── */
export function TermTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto border border-border">
      <table className="w-full border-collapse" style={{ fontSize: '11px' }}>
        {children}
      </table>
    </div>
  );
}
export const DenseTable = TermTable;

/* ── Dashboard Page ───────────────────────────────────────────── */
export function DashboardPage() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const marketStatus = getMarketStatus();
  const b = useOnChainBalances();

  const { data: movers } = useGetMarketMovers({
    query: { queryKey: getGetMarketMoversQueryKey(), refetchInterval: 30_000 },
  });

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetMarketMoversQueryKey() });
    }, 30_000);
    return () => clearInterval(id);
  }, [queryClient]);

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col gap-3">

      {/* ── Tagline + Market status bar ────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border border-border" style={{ background: 'hsl(var(--card))' }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '9px', letterSpacing: '0.22em', fontWeight: 700, color: 'hsl(var(--primary) / 0.7)' }}>
            CAPITAL MOVES IN SILENCE
          </span>
          <span style={{ fontSize: '9px', color: 'hsl(var(--border))' }}>·</span>
          <span style={{ fontSize: '8.5px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground) / 0.5)' }}>
            CONFIDENTIAL EXECUTION LAYER FOR TOKENIZED CAPITAL MARKETS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{
            width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
            background: marketStatus.color,
            boxShadow: marketStatus.session === 'OPEN' ? `0 0 6px ${marketStatus.color}` : 'none',
          }} />
          <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: marketStatus.color, fontWeight: 600 }}>
            {marketStatus.label}
          </span>
          <span style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.06em' }}>
            {marketStatus.description}
          </span>
        </div>
      </div>

      {/* ── VIONA Shield live banner ───────────────────────────── */}
      <Link href="/shield" style={{ textDecoration: 'none' }}>
        <div
          className="flex-shrink-0 flex items-center justify-between px-3 py-2 border border-green-900/50 cursor-pointer hover:bg-green-950/20 transition-colors"
          style={{ background: 'hsl(var(--card))' }}
        >
          <div className="flex items-center gap-2.5">
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
            <span style={{ fontSize: '9px', letterSpacing: '0.18em', fontWeight: 700, color: '#4ade80' }}>
              VIONA SHIELD LIVE
            </span>
            <span style={{ fontSize: '8.5px', color: 'hsl(var(--muted-foreground) / 0.5)', letterSpacing: '0.06em' }}>
              ◎ Private trading now active on Robinhood Chain · UltraHonk ZK proofs · Non-custodial
            </span>
          </div>
          <span style={{ fontSize: '8.5px', letterSpacing: '0.1em', color: '#4ade80' }}>OPEN SHIELD →</span>
        </div>
      </Link>

      {/* ── Real on-chain stat cards ────────────────────────────── */}
      <div className="grid grid-cols-4 gap-px flex-shrink-0" style={{ background: 'hsl(var(--border))' }}>

        {/* ETH Balance */}
        <div className="p-4 flex flex-col gap-1" style={{ background: 'hsl(var(--card))' }}>
          <div className="t-stat-label">ETH BALANCE</div>
          {!b.isConnected ? (
            <div className="t-stat-value" style={{ fontSize: '15px', color: 'hsl(var(--muted-foreground) / 0.3)' }}>—</div>
          ) : !b.isRobinhoodChain ? (
            <div style={{ fontSize: '11px', color: '#FFB800', letterSpacing: '0.06em', fontWeight: 600, marginTop: 4 }}>WRONG NETWORK</div>
          ) : (
            <div className="t-stat-value t-num">{fmtEth(b.ethBalance)}</div>
          )}
          <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>
            {b.isConnected && b.isRobinhoodChain
              ? fmt(b.ethUsd) + ' USD'
              : b.isConnected ? 'SWITCH TO CHAIN 4663' : 'CONNECT WALLET'}
          </div>
        </div>

        {/* USDG Balance */}
        <div className="p-4 flex flex-col gap-1" style={{ background: 'hsl(var(--card))' }}>
          <div className="t-stat-label">USDG BALANCE</div>
          <div className="t-stat-value t-num">
            {b.isConnected ? fmtUsdg(b.usdgBalance) : '—'}
          </div>
          <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>
            {b.isConnected ? 'GLOBAL DOLLAR ON ROBINHOOD CHAIN' : 'CONNECT WALLET'}
          </div>
        </div>

        {/* Total On-Chain Value */}
        <div className="p-4 flex flex-col gap-1" style={{ background: 'hsl(var(--card))' }}>
          <div className="t-stat-label">TOTAL ON-CHAIN VALUE</div>
          <div className="t-stat-value t-num">
            {b.isConnected ? fmt(b.totalUsd) : '—'}
          </div>
          <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>
            {b.isConnected ? 'ETH + USDG · LIVE FROM CHAIN' : 'CONNECT WALLET'}
          </div>
        </div>

        {/* Shield */}
        <Link href="/shield" style={{ textDecoration: 'none' }}>
          <div className="p-4 flex flex-col gap-1 h-full hover:bg-green-950/10 transition-colors" style={{ background: 'hsl(var(--card))' }}>
            <div className="t-stat-label" style={{ color: '#4ade80' }}>VIONA SHIELD</div>
            <div className="t-stat-value" style={{ fontSize: '15px', color: '#4ade80' }}>◎ LIVE</div>
            <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', color: '#4ade80' }}>
              VIEW PRIVATE BALANCE →
            </div>
          </div>
        </Link>
      </div>

      {/* ── Connect wallet prompt (when not connected) ─────────── */}
      {!b.isConnected && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border border-border" style={{ background: 'hsl(var(--card))' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.14em', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>
            CONNECT WALLET TO VIEW ON-CHAIN BALANCE
          </div>
        </div>
      )}

      {/* ── Market Movers ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* Gainers */}
        <div className="flex flex-col min-h-0 overflow-hidden border border-border" style={{ background: 'hsl(var(--card))' }}>
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
            <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))' }}>MARKET MOVERS</span>
            <span style={{ color: 'hsl(var(--border))' }}>·</span>
            <TrendingUp style={{ width: 9, height: 9, color: 'hsl(var(--success))' }} />
            <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--success))' }}>GAINERS</span>
          </div>
          {(movers?.gainers ?? []).slice(0, 6).map(asset => (
            <button
              key={asset.symbol} type="button"
              onClick={() => navigate(`/trade?symbol=${asset.symbol}`)}
              className="flex items-center justify-between px-3 py-2 border-b border-border hover:bg-white/[0.03] transition-colors text-left w-full"
              style={{ background: 'transparent', cursor: 'pointer' }}
            >
              <div className="flex items-center gap-2">
                <AssetLogo symbol={asset.symbol} logoUrl={asset.logoUrl} size={18} />
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'hsl(var(--foreground))' }}>{asset.symbol}</div>
                  <div style={{ fontSize: '8.5px', color: 'hsl(var(--muted-foreground))', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="t-num" style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(var(--success))' }}>
                  {formatPercent(asset.changePercent)}
                </div>
                <div className="t-num" style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))' }}>{fmt(asset.price)}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Losers */}
        <div className="flex flex-col min-h-0 overflow-hidden border border-border" style={{ background: 'hsl(var(--card))' }}>
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
            <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))' }}>MARKET MOVERS</span>
            <span style={{ color: 'hsl(var(--border))' }}>·</span>
            <TrendingDown style={{ width: 9, height: 9, color: 'hsl(var(--destructive))' }} />
            <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--destructive))' }}>LOSERS</span>
          </div>
          {(movers?.losers ?? []).slice(0, 6).map(asset => (
            <button
              key={asset.symbol} type="button"
              onClick={() => navigate(`/trade?symbol=${asset.symbol}`)}
              className="flex items-center justify-between px-3 py-2 border-b border-border hover:bg-white/[0.03] transition-colors text-left w-full"
              style={{ background: 'transparent', cursor: 'pointer' }}
            >
              <div className="flex items-center gap-2">
                <AssetLogo symbol={asset.symbol} logoUrl={asset.logoUrl} size={18} />
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'hsl(var(--foreground))' }}>{asset.symbol}</div>
                  <div style={{ fontSize: '8.5px', color: 'hsl(var(--muted-foreground))', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="t-num" style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(var(--destructive))' }}>
                  {formatPercent(asset.changePercent)}
                </div>
                <div className="t-num" style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))' }}>{fmt(asset.price)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
