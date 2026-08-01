import React, { useState } from 'react';
import { Link } from 'wouter';
import { useOnChainBalances } from '@/lib/use-onchain-balances';
import { useVIONATrader, type OnChainPosition } from '@/lib/use-trader';
import { useShieldSpend } from '@/lib/use-shield-spend';

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
function fmtAge(openTime: number) {
  const s = Math.floor(Date.now() / 1000) - openTime;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── Position row ─────────────────────────────────────────────── */
function PositionRow({
  pos,
  onClose,
  closing,
}: {
  pos: OnChainPosition;
  onClose: (id: bigint) => void;
  closing: boolean;
}) {
  const pnl = pos.unrealisedPnl ?? 0;
  const pnlPos = pnl >= 0;
  const pnlColor = pos.closed ? 'hsl(var(--muted-foreground))' : pnlPos ? '#4ade80' : '#f87171';
  const pct = pos.entryPrice > 0
    ? ((( pos.currentPrice ?? pos.entryPrice) - pos.entryPrice) / pos.entryPrice * 100 * (pos.isLong ? 1 : -1))
    : 0;

  return (
    <tr className="border-b border-border" style={{ opacity: pos.closed ? 0.45 : 1 }}>
      {/* Asset */}
      <td className="t-td pl-4">
        <div className="flex items-center gap-2">
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: pos.isLong ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '9px', fontWeight: 700,
            color: pos.isLong ? '#4ade80' : '#f87171',
          }}>
            {pos.isLong ? '↑' : '↓'}
          </div>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: '0.04em', color: 'hsl(var(--foreground))' }}>
              {pos.symbol}
            </div>
            <div style={{ fontSize: '7.5px', color: 'hsl(var(--muted-foreground))', display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ color: pos.isLong ? '#4ade80' : '#f87171' }}>{pos.isLong ? 'LONG' : 'SHORT'}</span>
              <span>·</span>
              <span>{fmtAge(pos.openTime)}</span>
              {pos.closed && <span style={{ color: '#FFB800' }}>· CLOSED</span>}
            </div>
          </div>
        </div>
      </td>
      {/* Collateral */}
      <td className="t-td text-right t-num" style={{ fontSize: '11px' }}>
        {fmt(pos.usdgCollateral)}
      </td>
      {/* Entry → Current */}
      <td className="t-td text-right" style={{ fontSize: '10px' }}>
        <div className="t-num" style={{ color: 'hsl(var(--foreground))' }}>{fmt(pos.currentPrice ?? pos.entryPrice)}</div>
        <div className="t-num" style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))' }}>entry {fmt(pos.entryPrice)}</div>
      </td>
      {/* P&L */}
      <td className="t-td text-right t-num" style={{ color: pnlColor, fontWeight: 700, fontSize: '11px' }}>
        {pos.closed ? '—' : (pnlPos ? '+' : '') + fmt(pnl)}
        {!pos.closed && pos.currentPrice != null && (
          <div style={{ fontSize: '8px', fontWeight: 400 }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </div>
        )}
      </td>
      {/* Close */}
      <td className="t-td text-right pr-4">
        {!pos.closed && (
          <button
            onClick={() => onClose(pos.id)}
            disabled={closing}
            style={{
              fontSize: '8px', letterSpacing: '0.08em', padding: '3px 8px',
              border: '1px solid rgba(248,113,113,0.4)',
              background: 'rgba(248,113,113,0.07)',
              color: '#f87171', cursor: closing ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--app-font-mono)', opacity: closing ? 0.5 : 1,
            }}
          >
            {closing ? 'CLOSING…' : 'CLOSE'}
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── Portfolio Page ───────────────────────────────────────────── */
export function PortfolioPage() {
  const b = useOnChainBalances();
  const { positions, step, closePosition, refreshPositions } = useVIONATrader();
  const { shieldedUsdg } = useShieldSpend();
  const [closingId, setClosingId] = useState<bigint | null>(null);

  const openPositions   = positions.filter(p => !p.closed);
  const closedPositions = positions.filter(p => p.closed);
  const totalPnl        = openPositions.reduce((s, p) => s + (p.unrealisedPnl ?? 0), 0);
  const totalCollateral = openPositions.reduce((s, p) => s + p.usdgCollateral, 0);

  const handleClose = async (id: bigint) => {
    setClosingId(id);
    try { await closePosition(id); } finally { setClosingId(null); }
  };

  /* ── Not connected ─────────────────────────────────────────── */
  if (!b.isConnected) {
    return (
      <div className="animate-in fade-in duration-300 h-full flex flex-col items-center justify-center gap-4">
        <div style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground) / 0.5)' }}>
          PORTFOLIO
        </div>
        <div style={{ fontSize: '12px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', textAlign: 'center', lineHeight: 2 }}>
          Connect your wallet to view your<br />real on-chain portfolio
        </div>
        <div style={{ fontSize: '8.5px', color: 'hsl(var(--muted-foreground) / 0.35)', letterSpacing: '0.06em' }}>
          USE SIDEBAR TO CONNECT →
        </div>
      </div>
    );
  }

  /* ── Wrong network ─────────────────────────────────────────── */
  if (!b.isRobinhoodChain) {
    return (
      <div className="animate-in fade-in duration-300 h-full flex flex-col items-center justify-center gap-4">
        <div style={{ fontSize: '9px', letterSpacing: '0.14em', color: '#FFB800' }}>⚠ WRONG NETWORK</div>
        <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.06em', textAlign: 'center', lineHeight: 2 }}>
          Switch to Robinhood Chain (ID 4663)<br />to view your real portfolio
        </div>
      </div>
    );
  }

  /* ── Connected ─────────────────────────────────────────────── */
  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col gap-3 overflow-y-auto" style={{ paddingBottom: 24 }}>

      {/* Header */}
      <div className="t-divider flex-shrink-0">
        <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'hsl(var(--muted-foreground))' }}>
          ON-CHAIN PORTFOLIO — ROBINHOOD CHAIN
        </span>
        <span style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground) / 0.4)', letterSpacing: '0.06em' }}>
          {b.address?.slice(0, 8)}…{b.address?.slice(-6)}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-px flex-shrink-0" style={{ background: 'hsl(var(--border))' }}>
        <div className="p-4" style={{ background: 'hsl(var(--card))' }}>
          <div className="t-stat-label">ETH BALANCE</div>
          <div className="t-stat-value t-num">{fmtEth(b.ethBalance)}</div>
          <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', marginTop: 3, color: 'hsl(var(--muted-foreground))' }}>
            {fmt(b.ethUsd)} · {b.ethPrice ? fmt(b.ethPrice) + '/ETH' : '—'}
          </div>
        </div>
        <div className="p-4" style={{ background: 'hsl(var(--card))' }}>
          <div className="t-stat-label">WALLET USDG</div>
          <div className="t-stat-value t-num">{fmtUsdg(b.usdgBalance)}</div>
          <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', marginTop: 3, color: 'hsl(var(--muted-foreground))' }}>
            PAXOS · CHAIN 4663
          </div>
        </div>
        <div className="p-4" style={{ background: 'hsl(var(--card))' }}>
          <div className="t-stat-label" style={{ color: '#4ade80' }}>◎ SHIELD USDG</div>
          <div className="t-stat-value t-num" style={{ color: '#4ade80' }}>${shieldedUsdg.toFixed(2)}</div>
          <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', marginTop: 3, color: 'hsl(var(--muted-foreground))' }}>
            ZK PRIVATE BALANCE
          </div>
        </div>
        <div className="p-4" style={{ background: 'hsl(var(--card))' }}>
          <div className="t-stat-label">OPEN P&amp;L</div>
          <div className="t-stat-value t-num" style={{ color: totalPnl >= 0 ? '#4ade80' : '#f87171' }}>
            {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)}
          </div>
          <div style={{ fontSize: '8.5px', letterSpacing: '0.08em', marginTop: 3, color: 'hsl(var(--muted-foreground))' }}>
            {openPositions.length} OPEN · {fmt(totalCollateral)} COLLATERAL
          </div>
        </div>
      </div>

      {/* Holdings table (wallet assets) */}
      <div className="border border-border flex-shrink-0" style={{ background: 'hsl(var(--card))' }}>
        <div className="border-b border-border px-4 py-2">
          <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))' }}>WALLET HOLDINGS</span>
        </div>
        <table className="w-full border-collapse" style={{ fontSize: '11px' }}>
          <thead>
            <tr>
              <th className="t-th text-left pl-4">ASSET</th>
              <th className="t-th text-right">BALANCE</th>
              <th className="t-th text-right">PRICE</th>
              <th className="t-th text-right pr-4">VALUE (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="t-td pl-4">
                <div className="flex items-center gap-2">
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'hsl(var(--muted) / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>Ξ</div>
                  <div>
                    <div style={{ fontWeight: 700, letterSpacing: '0.04em' }}>ETH</div>
                    <div style={{ fontSize: '8.5px', color: 'hsl(var(--muted-foreground))' }}>Ether · Gas token</div>
                  </div>
                </div>
              </td>
              <td className="t-td text-right t-num">{fmtEth(b.ethBalance)}</td>
              <td className="t-td text-right t-num">{b.ethPrice ? fmt(b.ethPrice) : '—'}</td>
              <td className="t-td text-right t-num pr-4" style={{ fontWeight: 700 }}>{fmt(b.ethUsd)}</td>
            </tr>
            <tr>
              <td className="t-td pl-4">
                <div className="flex items-center gap-2">
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'hsl(var(--success) / 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'hsl(var(--success))' }}>$</div>
                  <div>
                    <div style={{ fontWeight: 700, letterSpacing: '0.04em' }}>USDG</div>
                    <div style={{ fontSize: '8.5px', color: 'hsl(var(--muted-foreground))' }}>Global Dollar · Paxos</div>
                  </div>
                </div>
              </td>
              <td className="t-td text-right t-num">{fmtUsdg(b.usdgBalance)}</td>
              <td className="t-td text-right t-num">$1.00</td>
              <td className="t-td text-right t-num pr-4" style={{ fontWeight: 700 }}>{fmt(b.usdgUsd)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* CFD positions */}
      <div className="border border-border flex-shrink-0" style={{ background: 'hsl(var(--card))' }}>
        <div className="border-b border-border px-4 py-2 flex items-center justify-between">
          <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))' }}>
            CFD POSITIONS — VIONATRADER
          </span>
          <button
            onClick={refreshPositions}
            style={{ fontSize: '8px', letterSpacing: '0.08em', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', fontFamily: 'var(--app-font-mono)' }}
          >
            ↻ REFRESH
          </button>
        </div>

        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8">
            <div style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground) / 0.4)', textAlign: 'center', lineHeight: 2 }}>
              NO POSITIONS YET
            </div>
            <Link href="/trade" style={{
              fontSize: '9px', letterSpacing: '0.1em', padding: '5px 12px',
              border: '1px solid hsl(var(--primary) / 0.4)',
              color: 'hsl(var(--primary))', textDecoration: 'none',
            }}>
              OPEN A POSITION →
            </Link>
          </div>
        ) : (
          <table className="w-full border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              <tr>
                <th className="t-th text-left pl-4">ASSET</th>
                <th className="t-th text-right">COLLATERAL</th>
                <th className="t-th text-right">PRICE</th>
                <th className="t-th text-right">UNREAL. P&amp;L</th>
                <th className="t-th text-right pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map(pos => (
                <PositionRow
                  key={pos.id.toString()}
                  pos={pos}
                  onClose={handleClose}
                  closing={closingId === pos.id || step === 'closing'}
                />
              ))}
              {closedPositions.map(pos => (
                <PositionRow
                  key={pos.id.toString()}
                  pos={pos}
                  onClose={handleClose}
                  closing={false}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick links */}
      <div className="flex gap-2 flex-shrink-0">
        <Link href="/trade" style={{
          flex: 1, textAlign: 'center', fontSize: '8.5px', letterSpacing: '0.1em', padding: '7px',
          border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', textDecoration: 'none',
        }}>
          ↑ OPEN POSITION
        </Link>
        <Link href="/shield" style={{
          flex: 1, textAlign: 'center', fontSize: '8.5px', letterSpacing: '0.1em', padding: '7px',
          border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', textDecoration: 'none',
        }}>
          ◎ SHIELD BALANCE
        </Link>
        <Link href="/orders" style={{
          flex: 1, textAlign: 'center', fontSize: '8.5px', letterSpacing: '0.1em', padding: '7px',
          border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))', textDecoration: 'none',
        }}>
          ≡ ALL ORDERS
        </Link>
      </div>
    </div>
  );
}
