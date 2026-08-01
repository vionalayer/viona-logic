import React, { useState } from 'react';
import { Link } from 'wouter';
import { ExternalLink, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useVIONATrader, type OnChainPosition } from '@/lib/use-trader';
import { AssetLogo } from '@/components/asset-logo';
import { useAccount } from 'wagmi';

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPnl(n: number) {
  const sign = n >= 0 ? '+' : '-';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

function PositionRow({ pos, onClose }: { pos: OnChainPosition; onClose: (id: bigint) => void }) {
  const pnl = pos.unrealisedPnl ?? 0;
  const pnlPct = pos.usdgCollateral > 0 ? (pnl / pos.usdgCollateral) * 100 : 0;
  const isProfit = pnl >= 0;

  return (
    <div className="border-b border-border hover:bg-white/[0.02] transition-colors"
      style={{ display: 'grid', gridTemplateColumns: '36px 130px 1fr 1fr 1fr 1fr 90px 36px', alignItems: 'center', gap: 8, padding: '10px 16px' }}>

      {/* Direction badge */}
      <div style={{
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: pos.isLong ? 'hsl(var(--success) / 0.1)' : 'hsl(var(--destructive) / 0.1)',
        border: `1px solid ${pos.isLong ? 'hsl(var(--success) / 0.3)' : 'hsl(var(--destructive) / 0.3)'}`,
      }}>
        {pos.isLong
          ? <TrendingUp style={{ width: 12, height: 12, color: 'hsl(var(--success))' }} />
          : <TrendingDown style={{ width: 12, height: 12, color: 'hsl(var(--destructive))' }} />}
      </div>

      {/* Asset */}
      <div className="flex items-center gap-2">
        <AssetLogo symbol={pos.symbol} size={20} />
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: 'hsl(var(--foreground))', fontFamily: 'var(--app-font-mono)' }}>
            {pos.symbol}
          </div>
          <div style={{ fontSize: '8px', color: pos.isLong ? 'hsl(var(--success))' : 'hsl(var(--destructive))', letterSpacing: '0.06em', fontWeight: 700 }}>
            {pos.isLong ? 'LONG' : 'SHORT'}
          </div>
        </div>
      </div>

      {/* Shares */}
      <div>
        <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.08em', marginBottom: 1 }}>POSITION</div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--app-font-mono)', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          {pos.shares.toFixed(4)} shs
        </div>
      </div>

      {/* Entry */}
      <div>
        <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.08em', marginBottom: 1 }}>ENTRY</div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--app-font-mono)', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          {fmt(pos.entryPrice)}
        </div>
      </div>

      {/* Current */}
      <div>
        <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.08em', marginBottom: 1 }}>CURRENT</div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--app-font-mono)', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
          {pos.currentPrice ? fmt(pos.currentPrice) : '—'}
        </div>
      </div>

      {/* P&L */}
      <div>
        <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.08em', marginBottom: 1 }}>P&L</div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--app-font-mono)', fontWeight: 700,
          color: isProfit ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>
          {fmtPnl(pnl)}
          <span style={{ fontSize: '8px', marginLeft: 3, opacity: 0.8 }}>({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
        </div>
      </div>

      {/* Status + time */}
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '7.5px', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 2,
          color: pos.closed ? 'hsl(var(--muted-foreground))' : 'hsl(var(--success))',
        }}>
          {pos.closed ? 'CLOSED' : '● OPEN'}
        </div>
        <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))' }}>
          {timeAgo(pos.openTime)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {!pos.closed && (
          <button
            type="button"
            onClick={() => onClose(pos.id)}
            style={{
              fontSize: '7.5px', letterSpacing: '0.08em', fontWeight: 700,
              padding: '3px 7px', cursor: 'pointer', fontFamily: 'var(--app-font-mono)',
              background: 'hsl(var(--destructive) / 0.1)',
              border: '1px solid hsl(var(--destructive) / 0.3)',
              color: 'hsl(var(--destructive))',
            }}
          >
            CLOSE
          </button>
        )}
        <a
          href={`https://robinhoodchain.blockscout.com/address/${pos.owner}`}
          target="_blank" rel="noopener noreferrer"
          style={{ color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center' }}
          className="hover:opacity-80"
        >
          <ExternalLink style={{ width: 10, height: 10 }} />
        </a>
      </div>
    </div>
  );
}

/* ── Orders Page ──────────────────────────────────────────────────── */
export function OrdersPage() {
  const { isConnected } = useAccount();
  const { positions, step, lastTxHash, closePosition, refreshPositions, error, setError } = useVIONATrader();
  const [closing, setClosing] = useState<bigint | null>(null);

  const open   = positions.filter(p => !p.closed);
  const closed = positions.filter(p => p.closed);

  const totalPnl      = open.reduce((s, p) => s + (p.unrealisedPnl ?? 0), 0);
  const totalCollateral = open.reduce((s, p) => s + p.usdgCollateral, 0);
  const pnlColor = totalPnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))';

  async function handleClose(id: bigint) {
    setClosing(id);
    setError('');
    try {
      await closePosition(id);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Close failed');
    } finally {
      setClosing(null);
    }
  }

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col gap-3">

      <div className="t-divider flex-shrink-0">
        <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'hsl(var(--muted-foreground))' }}>
          ON-CHAIN POSITIONS · VIONATRADER · ROBINHOOD CHAIN 4663
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: 'OPEN POSITIONS',   value: open.length.toString() },
          { label: 'CLOSED POSITIONS', value: closed.length.toString() },
          { label: 'TOTAL COLLATERAL', value: totalCollateral > 0 ? `$${totalCollateral.toFixed(2)}` : '—' },
          { label: 'UNREALISED P&L',   value: open.length > 0 ? fmtPnl(totalPnl) : '—', color: open.length > 0 ? pnlColor : undefined },
        ].map(s => (
          <div key={s.label} className="border border-border px-4 py-3" style={{ background: 'hsl(var(--card))' }}>
            <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--app-font-mono)', color: s.color ?? 'hsl(var(--foreground))' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 border flex-shrink-0" style={{ borderColor: 'hsl(var(--destructive) / 0.3)', background: 'hsl(var(--destructive) / 0.05)', fontSize: '8.5px', letterSpacing: '0.06em', color: 'hsl(var(--destructive))' }}>
          ⚠ {error}
        </div>
      )}

      {/* Last tx */}
      {lastTxHash && (
        <div className="px-4 py-2 border border-green-900/30 flex items-center justify-between flex-shrink-0"
          style={{ background: 'rgba(74,222,128,0.04)', fontSize: '8px', letterSpacing: '0.06em' }}>
          <span style={{ color: '#4ade80' }}>● LAST TX CONFIRMED</span>
          <a href={`https://robinhoodchain.blockscout.com/tx/${lastTxHash}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1" style={{ color: 'hsl(var(--primary))', textDecoration: 'none' }}>
            {lastTxHash.slice(0, 12)}…{lastTxHash.slice(-6)} <ExternalLink style={{ width: 9, height: 9 }} />
          </a>
        </div>
      )}

      {/* Positions table */}
      <div className="border border-border flex flex-col flex-1 min-h-0" style={{ background: 'hsl(var(--card))' }}>
        <div className="border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
          <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))' }}>
            ON-CHAIN POSITIONS — VIONATRADER
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => refreshPositions()}
              className="flex items-center gap-1 hover:opacity-70"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
            >
              <RefreshCw style={{ width: 10, height: 10 }} />
              <span style={{ fontSize: '8px', letterSpacing: '0.06em' }}>REFRESH</span>
            </button>
            <Link href="/trade" style={{
              fontSize: '8.5px', letterSpacing: '0.1em', padding: '4px 10px',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--primary))',
              textDecoration: 'none',
            }}>
              OPEN POSITION →
            </Link>
          </div>
        </div>

        {/* Column headers */}
        {positions.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '36px 130px 1fr 1fr 1fr 1fr 90px 36px',
            alignItems: 'center', gap: 8, padding: '6px 16px',
            background: 'hsl(var(--background) / 0.5)', borderBottom: '1px solid hsl(var(--border))',
          }}>
            {['', 'ASSET', 'POSITION', 'ENTRY', 'CURRENT', 'P&L', 'STATUS', ''].map((h, i) => (
              <div key={i} style={{ fontSize: '7.5px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground) / 0.6)' }}>{h}</div>
            ))}
          </div>
        )}

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div style={{ fontSize: '28px', opacity: 0.15 }}>◉</div>
              <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground) / 0.5)' }}>
                CONNECT WALLET TO VIEW POSITIONS
              </div>
            </div>
          ) : positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div style={{ fontSize: '28px', opacity: 0.15 }}>◉</div>
              <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground) / 0.5)' }}>
                NO POSITIONS YET
              </div>
              <Link href="/trade" style={{
                fontSize: '9px', letterSpacing: '0.1em', padding: '7px 18px',
                border: '1px solid hsl(var(--border))', color: 'hsl(var(--primary))', textDecoration: 'none',
              }}>
                OPEN FIRST POSITION →
              </Link>
            </div>
          ) : (
            <>
              {open.map(p => (
                <PositionRow
                  key={p.id.toString()}
                  pos={p}
                  onClose={handleClose}
                />
              ))}
              {closed.length > 0 && open.length > 0 && (
                <div className="px-4 py-2 border-b border-border" style={{ background: 'hsl(var(--border) / 0.1)' }}>
                  <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground) / 0.6)' }}>CLOSED</span>
                </div>
              )}
              {closed.map(p => (
                <PositionRow
                  key={p.id.toString()}
                  pos={p}
                  onClose={handleClose}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Shield CTA */}
      <Link href="/shield" style={{ textDecoration: 'none', display: 'block', flexShrink: 0 }}>
        <div className="flex items-center justify-between px-3 py-2.5 border border-green-900/50 hover:bg-green-950/20 transition-colors cursor-pointer"
          style={{ background: 'hsl(var(--card))' }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '8px', color: '#4ade80' }}>◎</span>
            <div style={{ fontSize: '8.5px', letterSpacing: '0.1em', fontWeight: 700, color: '#4ade80' }}>
              EXECUTE PRIVATELY — VIONA SHIELD · ZERO MEMPOOL EXPOSURE
            </div>
          </div>
          <span style={{ fontSize: '8px', color: '#4ade80', letterSpacing: '0.06em' }}>→</span>
        </div>
      </Link>
    </div>
  );
}
