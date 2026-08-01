import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useChainId } from 'wagmi';
import {
  useListMarkets, getListMarketsQueryKey,
  useGetMarket, getGetMarketQueryKey,
  useGetMarketChart, getGetMarketChartQueryKey,
} from '@workspace/api-client-react';
import { Link } from 'wouter';
import {
  ChevronDown, Search, ExternalLink, CheckCircle,
  Loader2, AlertTriangle, ArrowLeftRight, TrendingUp, TrendingDown, Shield, Zap,
} from 'lucide-react';
import { useOnChainBalances } from '@/lib/use-onchain-balances';
import { AssetLogo } from '@/components/asset-logo';
import {
  Area, AreaChart, ResponsiveContainer, YAxis, Tooltip, XAxis, ReferenceLine
} from 'recharts';
import { getMarketStatus, canTradeNow } from '@/lib/market-status';
import { useVIONATrader } from '@/lib/use-trader';
import { useShieldSpend } from '@/lib/use-shield-spend';
import { useShieldTrade } from '@/lib/use-shield-trade';
import { CONTRACTS } from '@/lib/shield/contract';
import { useEthToUsdg } from '@/lib/use-eth-to-usdg';

/* ─── Helpers ───────────────────────────────────────────────────── */
function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBig(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/* ─── Asset Picker ─────────────────────────────────────────────── */
function AssetPicker({
  markets, symbol, onChange,
}: {
  markets: { symbol: string; name: string; logoUrl?: string | null }[];
  symbol: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const current = markets.find(m => m.symbol === symbol);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = markets.filter(m =>
    !q || m.symbol.toLowerCase().includes(q.toLowerCase()) || m.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        style={{ background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}
      >
        <AssetLogo symbol={symbol} logoUrl={current?.logoUrl} size={28} />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.04em', color: 'hsl(var(--foreground))', fontFamily: 'var(--app-font-mono)' }}>
            {symbol}
          </div>
          <div style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current?.name}
          </div>
        </div>
        <ChevronDown style={{ width: 13, height: 13, color: 'hsl(var(--muted-foreground))', flexShrink: 0, marginLeft: 2 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
          width: 260, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
          maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search style={{ width: 11, height: 11, color: 'hsl(var(--muted-foreground))' }} />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="SEARCH..."
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                fontSize: '11px', letterSpacing: '0.08em', color: 'hsl(var(--foreground))',
                fontFamily: 'var(--app-font-mono)', width: '100%',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(m => (
              <button
                key={m.symbol}
                type="button"
                onClick={() => { onChange(m.symbol); setOpen(false); setQ(''); }}
                className="flex items-center gap-2 w-full hover:bg-white/[0.04] transition-colors"
                style={{
                  padding: '8px 12px', border: 'none', cursor: 'pointer',
                  background: m.symbol === symbol ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                  borderLeft: m.symbol === symbol ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                }}
              >
                <AssetLogo symbol={m.symbol} logoUrl={m.logoUrl} size={20} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', color: 'hsl(var(--foreground))', fontFamily: 'var(--app-font-mono)' }}>
                    {m.symbol}
                  </div>
                  <div style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Price Chart ───────────────────────────────────────────────── */
const CHART_RANGES = ['1d', '5d', '1mo', '3mo', '1y'] as const;
type ChartRange = typeof CHART_RANGES[number];

function PriceChart({ symbol, prevClose }: { symbol: string; prevClose: number | null | undefined }) {
  const [range, setRange] = useState<ChartRange>('1d');
  const { data: chart } = useGetMarketChart(symbol, range, {
    query: { queryKey: getGetMarketChartQueryKey(symbol, range), refetchInterval: 60000 },
  });

  const points = chart?.points ?? [];
  const isPositive = points.length > 1 ? points[points.length - 1].price >= points[0].price : true;
  const color = isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex items-center justify-between border-b border-border" style={{ padding: '6px 12px' }}>
        <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>PRICE CHART</span>
        <div className="flex gap-0">
          {CHART_RANGES.map(r => (
            <button key={r} type="button" onClick={() => setRange(r)} style={{
              padding: '2px 8px', fontSize: '9px', letterSpacing: '0.06em',
              fontFamily: 'var(--app-font-mono)', border: 'none', cursor: 'pointer',
              background: range === r ? 'hsl(var(--primary) / 0.15)' : 'transparent',
              color: range === r ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '8px 0 4px' }}>
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '10px', letterSpacing: '0.08em' }}>
            LOADING CHART…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trade-chart-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp"
                tickFormatter={val => {
                  const d = new Date(val);
                  return range === '1d'
                    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }}
                stroke="hsl(var(--border))"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontFamily: 'var(--app-font-mono)' }}
                minTickGap={50} axisLine={false} tickLine={false}
              />
              <YAxis domain={['auto', 'auto']}
                tickFormatter={val => '$' + val.toFixed(0)}
                stroke="hsl(var(--border))"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontFamily: 'var(--app-font-mono)' }}
                width={52} axisLine={false} tickLine={false}
              />
              {prevClose != null && range === '1d' && (
                <ReferenceLine y={prevClose} stroke="hsl(var(--muted-foreground) / 0.3)" strokeDasharray="3 3" />
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const pt = payload[0].payload;
                  return (
                    <div style={{
                      background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                      padding: '6px 10px', fontSize: '10px', fontFamily: 'var(--app-font-mono)',
                    }}>
                      <div style={{ color: 'hsl(var(--muted-foreground))', fontSize: '9px', marginBottom: 2 }}>
                        {new Date(pt.timestamp).toLocaleString()}
                      </div>
                      <div style={{ fontWeight: 600, color: color }}>{fmt(pt.price)}</div>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="price" stroke={color} strokeWidth={1.5}
                fill="url(#trade-chart-grad)" dot={false} activeDot={{ r: 3, fill: color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ─── Shared success view ───────────────────────────────────────── */
function SuccessView({ txHash, rows, onReset, label }: {
  txHash: string;
  rows: { label: string; value: string }[];
  onReset: () => void;
  label: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>{label}</span>
        <span style={{ fontSize: '8px', color: 'hsl(var(--success))' }}>● ON-CHAIN CONFIRMED</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-5 gap-4">
        <CheckCircle style={{ width: 32, height: 32, color: 'hsl(var(--success))' }} />
        <div className="w-full border border-border" style={{ background: 'hsl(var(--background))' }}>
          {rows.map((r, i, a) => (
            <div key={r.label} className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: i < a.length - 1 ? '1px solid hsl(var(--border))' : 'none' }}>
              <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>{r.label}</span>
              <span style={{ fontSize: '9px', fontWeight: 600, fontFamily: 'var(--app-font-mono)', color: 'hsl(var(--foreground))' }}>{r.value}</span>
            </div>
          ))}
        </div>
        <a href={`https://robinhoodchain.blockscout.com/tx/${txHash}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1"
          style={{ fontSize: '8px', color: 'hsl(var(--primary))', textDecoration: 'none', letterSpacing: '0.06em' }}>
          VIEW ON BLOCKSCOUT <ExternalLink style={{ width: 8, height: 8 }} />
        </a>
        <button type="button" onClick={onReset}
          style={{
            width: '100%', padding: '8px', background: 'transparent',
            border: '1px solid hsl(var(--border))',
            fontSize: '9px', letterSpacing: '0.1em', cursor: 'pointer',
            color: 'hsl(var(--foreground))', fontFamily: 'var(--app-font-mono)',
          }}>
          OPEN ANOTHER
        </button>
        <Link href="/orders" style={{ fontSize: '8px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>
          VIEW POSITIONS →
        </Link>
      </div>
    </div>
  );
}

/* ─── Spinner view ──────────────────────────────────────────────── */
function SpinnerView({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 p-6">
      <Loader2 style={{ width: 28, height: 28, color: 'hsl(var(--primary))' }} className="animate-spin" />
      <div style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'hsl(var(--foreground))', textAlign: 'center', lineHeight: 2 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: '8px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── Shared error display ──────────────────────────────────────── */
function ErrBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border"
      style={{ borderColor: 'hsl(var(--destructive) / 0.3)', background: 'hsl(var(--destructive) / 0.05)', fontSize: '8px', letterSpacing: '0.06em', color: 'hsl(var(--destructive))' }}>
      <AlertTriangle style={{ width: 10, height: 10, flexShrink: 0 }} />
      {msg}
    </div>
  );
}

/* ─── Amount input row ──────────────────────────────────────────── */
function AmountInput({ label, max, value, onChange, suffix }: {
  label: string; max?: number; value: string;
  onChange: (v: string) => void; suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>{label}</span>
        {max != null && max > 0 && (
          <button type="button"
            onClick={() => onChange(Math.max(0, max - 0.01).toFixed(2))}
            style={{ fontSize: '7.5px', letterSpacing: '0.06em', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))' }}>
            MAX {fmt(max)}
          </button>
        )}
      </div>
      <div className="flex items-center border border-border" style={{ background: 'hsl(var(--background))' }}>
        <input type="number" min="0" step="any" value={value}
          onChange={e => onChange(e.target.value)} placeholder="0.00"
          style={{
            flex: 1, padding: '10px 12px', background: 'transparent', border: 'none',
            outline: 'none', fontSize: '15px', fontFamily: 'var(--app-font-mono)',
            color: 'hsl(var(--foreground))',
          }} />
        {suffix && (
          <span style={{ padding: '0 12px', fontSize: '9px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Funding mode toggle ───────────────────────────────────────── */
type FundMode = 'wallet' | 'shield';

function FundModeToggle({ mode, onChange, walletUsdg, shieldUsdg }: {
  mode: FundMode; onChange: (m: FundMode) => void;
  walletUsdg: number; shieldUsdg: number;
}) {
  return (
    <div className="grid grid-cols-2 border border-border" style={{ background: 'hsl(var(--background))' }}>
      {([
        { id: 'wallet' as const, label: 'WALLET', sub: `${fmt(walletUsdg)} USDG`, icon: null },
        { id: 'shield' as const, label: 'SHIELD', sub: `${fmt(shieldUsdg)} USDG`, icon: <Shield style={{ width: 9, height: 9 }} /> },
      ] as const).map(({ id, label, sub, icon }) => (
        <button key={id} type="button" onClick={() => onChange(id)}
          style={{
            padding: '8px 10px', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--app-font-mono)', textAlign: 'left',
            background: mode === id ? (id === 'shield' ? 'rgba(74,222,128,0.08)' : 'hsl(var(--primary) / 0.08)') : 'transparent',
            borderBottom: mode === id ? `2px solid ${id === 'shield' ? '#4ade80' : 'hsl(var(--primary))'}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: mode === id ? (id === 'shield' ? '#4ade80' : 'hsl(var(--primary))') : 'hsl(var(--muted-foreground))' }}>
              {label}
            </span>
            {icon && <span style={{ color: mode === id ? '#4ade80' : 'hsl(var(--muted-foreground) / 0.5)' }}>{icon}</span>}
          </div>
          <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', marginTop: 1 }}>{sub}</div>
        </button>
      ))}
    </div>
  );
}

/* ─── POSITIONS form (LONG / SHORT) ────────────────────────────── */
function PositionsForm({ symbol, price, walletUsdg, shieldUsdg }: {
  symbol: string; price: number; walletUsdg: number; shieldUsdg: number;
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { isDeployed, step: traderStep, lastTxHash, openPosition, resetStep, setError: setTErr, error: tErr } = useVIONATrader();
  const { step: spendStep, phaseLabel, progress, generateProof, reset: resetSpend, setError: setSErr, error: sErr, traderAddress } = useShieldSpend();
  const { step: shieldTradeStep, txHash: stHash, openShieldedPosition, reset: resetST, setError: setSTErr, error: stErr } = useShieldTrade();

  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [fundMode, setFundMode] = useState<FundMode>('wallet');
  const [rawAmount, setRawAmount] = useState('');

  const wrongChain = chainId !== 4663;

  useEffect(() => { setRawAmount(''); resetStep(); resetSpend(); resetST(); }, [symbol]);

  const amount = parseFloat(rawAmount) || 0;
  const FEE = 0.001;
  const fee = amount * FEE;
  const collateral = amount - fee;
  const shares = price > 0 ? collateral / price : 0;

  const maxBalance = fundMode === 'shield' ? shieldUsdg : walletUsdg;
  const overBalance = amount > maxBalance;
  const error = tErr || sErr || stErr;
  const setError = (e: string) => { setTErr(e); setSErr(e); setSTErr(e); };

  // ── Determine overall state
  const isProving   = spendStep === 'signing' || spendStep === 'building' || spendStep === 'proving';
  const isSubmitting = traderStep === 'approving' || traderStep === 'opening' || shieldTradeStep === 'submitting' || shieldTradeStep === 'confirming';
  const isDone      = traderStep === 'done' || shieldTradeStep === 'done';
  const txHash      = lastTxHash || stHash;

  const canOpen = isConnected && !wrongChain && isDeployed && price > 0 && amount >= 1 && !overBalance && traderStep === 'idle' && spendStep === 'idle' && shieldTradeStep === 'idle';

  async function handleOpen() {
    if (!canOpen) return;
    setError('');
    try {
      if (fundMode === 'wallet') {
        await openPosition(symbol, amount, side === 'LONG');
      } else {
        // Shield flow: generate ZK proof → submit openShieldedPosition atomically
        const { statement, ciphertexts, proof } = await generateProof(amount, traderAddress);
        await openShieldedPosition(statement, ciphertexts, proof, symbol, side === 'LONG');
      }
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? 'Transaction failed';
      if (!msg.includes('rejected') && !msg.includes('denied')) setError(msg);
      resetStep(); resetSpend(); resetST();
    }
  }

  function handleReset() { resetStep(); resetSpend(); resetST(); setError(''); setRawAmount(''); }

  // ── Done
  if (isDone && txHash) {
    return (
      <SuccessView
        txHash={txHash}
        label="POSITION OPENED"
        onReset={handleReset}
        rows={[
          { label: 'DIRECTION',  value: side },
          { label: 'SYMBOL',     value: symbol },
          { label: 'COLLATERAL', value: `${fmt(collateral)} USDG` },
          { label: 'ENTRY',      value: fmt(price) },
          { label: 'SHARES',     value: shares.toFixed(6) },
          { label: 'FUNDED VIA', value: fundMode === 'shield' ? 'VIONA SHIELD (PRIVATE)' : 'WALLET USDG' },
        ]}
      />
    );
  }

  // ── ZK Proving
  if (isProving) {
    return (
      <SpinnerView
        label={phaseLabel || 'GENERATING ZK PROOF…'}
        sub={progress > 0 ? `${progress}%` : 'Do not close this tab'}
      />
    );
  }

  // ── Submitting to chain
  if (isSubmitting) {
    const labels: Record<string, string> = {
      approving: 'STEP 1/2 — APPROVE USDG IN METAMASK…',
      opening:   'STEP 2/2 — CONFIRM POSITION IN METAMASK…',
      submitting: 'CONFIRM IN METAMASK…',
      confirming: 'WAITING FOR CONFIRMATION…',
    };
    const curStep = (traderStep !== 'idle' ? traderStep : shieldTradeStep) as string;
    return <SpinnerView label={labels[curStep] ?? 'BROADCASTING…'} sub="Check MetaMask" />;
  }

  // ── Idle form
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>EXECUTION LAYER</span>
        <span className="flex items-center gap-1.5" style={{ fontSize: '8px', letterSpacing: '0.08em', color: 'hsl(var(--success))' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'hsl(var(--success))', boxShadow: '0 0 4px hsl(var(--success))', display: 'inline-block' }} />
          LIVE · CHAIN 4663
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
        {isConnected && wrongChain && (
          <div className="flex items-center gap-2 px-3 py-2 border" style={{ borderColor: 'rgba(255,184,0,0.3)', background: 'rgba(255,184,0,0.05)' }}>
            <AlertTriangle style={{ width: 12, height: 12, color: '#FFB800', flexShrink: 0 }} />
            <span style={{ fontSize: '8px', letterSpacing: '0.08em', color: '#FFB800' }}>SWITCH TO ROBINHOOD CHAIN (4663)</span>
          </div>
        )}

        {/* Funding source */}
        {isConnected && (
          <FundModeToggle mode={fundMode} onChange={setFundMode} walletUsdg={walletUsdg} shieldUsdg={shieldUsdg} />
        )}

        {/* Shield note */}
        {fundMode === 'shield' && (
          <div className="flex items-center gap-2 px-3 py-2 border border-green-900/40" style={{ background: 'rgba(74,222,128,0.04)' }}>
            <Shield style={{ width: 10, height: 10, color: '#4ade80', flexShrink: 0 }} />
            <span style={{ fontSize: '8px', letterSpacing: '0.08em', color: '#4ade80' }}>
              USDG FLOWS DIRECTLY FROM SHIELD POOL — ZERO WALLET EXPOSURE
            </span>
          </div>
        )}

        {/* LONG / SHORT */}
        <div className="grid grid-cols-2 border border-border" style={{ background: 'hsl(var(--background))' }}>
          {(['LONG', 'SHORT'] as const).map(s => (
            <button key={s} type="button" onClick={() => { setSide(s); setError(''); }}
              style={{
                padding: '9px', fontSize: '10px', letterSpacing: '0.1em', fontWeight: 700,
                border: 'none', cursor: 'pointer', fontFamily: 'var(--app-font-mono)',
                background: side === s
                  ? (s === 'LONG' ? 'hsl(var(--success) / 0.18)' : 'hsl(var(--destructive) / 0.18)')
                  : 'transparent',
                color: side === s
                  ? (s === 'LONG' ? 'hsl(var(--success))' : 'hsl(var(--destructive))')
                  : 'hsl(var(--muted-foreground))',
                borderBottom: side === s
                  ? `2px solid ${s === 'LONG' ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}`
                  : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
              {s === 'LONG' ? '↑ LONG' : '↓ SHORT'}
            </button>
          ))}
        </div>

        <AmountInput
          label="USDG COLLATERAL"
          max={maxBalance}
          value={rawAmount}
          onChange={v => { setRawAmount(v); setError(''); }}
          suffix="USDG"
        />

        {/* Preview */}
        {amount >= 1 && price > 0 && (
          <div className="border border-border" style={{ background: 'hsl(var(--background))' }}>
            {[
              { label: 'DIRECTION',   value: side, color: side === 'LONG' ? 'hsl(var(--success))' : 'hsl(var(--destructive))' },
              { label: 'POSITION',    value: `${shares.toFixed(6)} ${symbol}` },
              { label: 'ENTRY PRICE', value: fmt(price) },
              { label: 'COLLATERAL',  value: `${fmt(collateral)} USDG` },
              { label: 'FEE (0.1%)',  value: `${fmt(fee)} USDG` },
              { label: 'FUNDED VIA',  value: fundMode === 'shield' ? '◎ SHIELD (PRIVATE)' : '◈ WALLET USDG', color: fundMode === 'shield' ? '#4ade80' : undefined },
            ].map((r, i, a) => (
              <div key={r.label} className="flex items-center justify-between px-3 py-1.5"
                style={{ borderBottom: i < a.length - 1 ? '1px solid hsl(var(--border))' : 'none' }}>
                <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>{r.label}</span>
                <span style={{ fontSize: '9px', fontWeight: 600, fontFamily: 'var(--app-font-mono)', color: (r as any).color ?? 'hsl(var(--foreground))' }}>{r.value}</span>
              </div>
            ))}
          </div>
        )}

        <ErrBanner msg={error} />
        {overBalance && amount > 0 && (
          <div style={{ fontSize: '8px', letterSpacing: '0.08em', color: 'hsl(var(--destructive))' }}>
            ⚠ INSUFFICIENT {fundMode === 'shield' ? 'SHIELDED' : 'WALLET'} USDG
            {fundMode === 'wallet' && (
              <button type="button" onClick={() => setFundMode('shield')}
                style={{ marginLeft: 6, fontSize: '7.5px', color: '#4ade80', background: 'none', border: 'none', cursor: 'pointer' }}>
                TRY SHIELD →
              </button>
            )}
          </div>
        )}

        <button type="button" onClick={handleOpen} disabled={!canOpen}
          style={{
            marginTop: 'auto', width: '100%', padding: '11px',
            background: !canOpen
              ? 'hsl(var(--border) / 0.4)'
              : side === 'LONG' ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)',
            border: `1px solid ${!canOpen
              ? 'hsl(var(--border))'
              : side === 'LONG' ? 'hsl(var(--success) / 0.5)' : 'hsl(var(--destructive) / 0.5)'}`,
            fontSize: '9px', letterSpacing: '0.12em', fontWeight: 700,
            cursor: !canOpen ? 'not-allowed' : 'pointer',
            color: !canOpen
              ? 'hsl(var(--muted-foreground))'
              : side === 'LONG' ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
            fontFamily: 'var(--app-font-mono)', transition: 'all 0.15s',
          }}>
          {!isConnected ? 'CONNECT WALLET TO TRADE'
            : wrongChain ? 'SWITCH TO ROBINHOOD CHAIN'
            : !isDeployed ? 'LOADING CONTRACT…'
            : amount < 1 ? 'ENTER AMOUNT (MIN $1 USDG)'
            : overBalance ? `INSUFFICIENT ${fundMode === 'shield' ? 'SHIELDED' : 'WALLET'} USDG`
            : fundMode === 'shield'
              ? `◎ SHIELD OPEN ${side} ${symbol} — ${fmt(amount)} USDG`
              : `OPEN ${side} ${symbol} — ${fmt(amount)} USDG`}
        </button>

        {fundMode === 'shield' && isConnected && !wrongChain && (
          <div style={{ fontSize: '7.5px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground) / 0.6)', textAlign: 'center', lineHeight: 1.6 }}>
            ZK PROOF GENERATION + 1 METAMASK SIGNATURE — NO APPROVE NEEDED
          </div>
        )}
        {fundMode === 'wallet' && isConnected && !wrongChain && (
          <div style={{ fontSize: '7.5px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground) / 0.6)', textAlign: 'center', lineHeight: 1.6 }}>
            2 METAMASK SIGNATURES: APPROVE USDG + OPEN POSITION
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SWAP form (Shield → Stock spot) ──────────────────────────── */
function SwapForm({ symbol, price, shieldUsdg, assetName }: {
  symbol: string; price: number; shieldUsdg: number; assetName?: string;
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { isDeployed } = useVIONATrader();
  const { step: spendStep, phaseLabel, progress, generateProof, reset: resetSpend, setError: setSErr, error: sErr, traderAddress } = useShieldSpend();
  const { step: shieldTradeStep, txHash: stHash, swapShielded, reset: resetST, setError: setSTErr, error: stErr } = useShieldTrade();

  const [rawAmount, setRawAmount] = useState('');

  const wrongChain = chainId !== 4663;

  useEffect(() => { setRawAmount(''); resetSpend(); resetST(); }, [symbol]);

  const amount = parseFloat(rawAmount) || 0;
  const FEE = 0.001;
  const collateral = amount * (1 - FEE);
  const sharesOut = price > 0 ? collateral / price : 0;
  const overBalance = amount > shieldUsdg;
  const error = sErr || stErr;
  const setError = (e: string) => { setSErr(e); setSTErr(e); };

  const isProving    = spendStep === 'signing' || spendStep === 'building' || spendStep === 'proving';
  const isSubmitting = shieldTradeStep === 'submitting' || shieldTradeStep === 'confirming';
  const isDone       = shieldTradeStep === 'done';
  const canSwap      = isConnected && !wrongChain && isDeployed && price > 0 && amount >= 1 && !overBalance && spendStep === 'idle' && shieldTradeStep === 'idle';

  async function handleSwap() {
    if (!canSwap) return;
    setError('');
    try {
      const { statement, ciphertexts, proof } = await generateProof(amount, traderAddress);
      await swapShielded(statement, ciphertexts, proof, symbol);
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? 'Swap failed';
      if (!msg.includes('rejected') && !msg.includes('denied')) setError(msg);
      resetSpend(); resetST();
    }
  }

  function handleReset() { resetSpend(); resetST(); setError(''); setRawAmount(''); }

  if (isDone && stHash) {
    return (
      <SuccessView
        txHash={stHash}
        label="SWAP COMPLETE"
        onReset={handleReset}
        rows={[
          { label: 'FROM',     value: `${fmt(amount)} USDG (SHIELDED)` },
          { label: 'TO',       value: `${sharesOut.toFixed(6)} ${symbol}` },
          { label: 'PRICE',    value: fmt(price) },
          { label: 'FEE',      value: `${fmt(amount * FEE)} USDG` },
          { label: 'PRIVACY',  value: 'ZERO WALLET EXPOSURE' },
        ]}
      />
    );
  }

  if (isProving) {
    return (
      <SpinnerView
        label={phaseLabel || 'GENERATING ZK PROOF…'}
        sub={progress > 0 ? `${progress}%` : 'Do not close this tab'}
      />
    );
  }

  if (isSubmitting) {
    return <SpinnerView label="CONFIRM IN METAMASK…" sub="Broadcasting to Robinhood Chain" />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>PRIVATE SWAP</span>
        <span style={{ fontSize: '8px', color: '#4ade80', letterSpacing: '0.08em' }}>◎ FROM SHIELD</span>
      </div>

      <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
        {isConnected && wrongChain && (
          <div className="flex items-center gap-2 px-3 py-2 border" style={{ borderColor: 'rgba(255,184,0,0.3)', background: 'rgba(255,184,0,0.05)' }}>
            <AlertTriangle style={{ width: 12, height: 12, color: '#FFB800', flexShrink: 0 }} />
            <span style={{ fontSize: '8px', letterSpacing: '0.08em', color: '#FFB800' }}>SWITCH TO ROBINHOOD CHAIN (4663)</span>
          </div>
        )}

        {/* Privacy badge */}
        <div className="flex items-center gap-2 px-3 py-2 border border-green-900/40" style={{ background: 'rgba(74,222,128,0.04)' }}>
          <Shield style={{ width: 10, height: 10, color: '#4ade80', flexShrink: 0 }} />
          <span style={{ fontSize: '8px', letterSpacing: '0.07em', color: '#4ade80' }}>
            SWAP DIRECTLY FROM SHIELD — USDG NEVER TOUCHES YOUR WALLET
          </span>
        </div>

        {/* FROM */}
        <div>
          <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>FROM</div>
          <AmountInput
            label="SHIELDED USDG"
            max={shieldUsdg}
            value={rawAmount}
            onChange={v => { setRawAmount(v); setError(''); }}
            suffix="USDG"
          />
          <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
            Available: <span style={{ color: '#4ade80' }}>{fmt(shieldUsdg)}</span> (shielded)
          </div>
        </div>

        {/* Swap arrow */}
        <div className="flex items-center justify-center">
          <ArrowLeftRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
        </div>

        {/* TO */}
        <div>
          <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>TO</div>
          <div className="border border-border flex items-center" style={{ background: 'hsl(var(--background) / 0.5)', padding: '10px 12px' }}>
            <span style={{ fontSize: '15px', fontFamily: 'var(--app-font-mono)', color: amount >= 1 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.4)' }}>
              {amount >= 1 ? sharesOut.toFixed(6) : '0.000000'}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '9px', letterSpacing: '0.08em', color: 'hsl(var(--foreground))', fontWeight: 700 }}>
              {symbol}
            </span>
          </div>
          <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
            {assetName} · {fmt(price)}/share
          </div>
        </div>

        {/* Summary */}
        {amount >= 1 && price > 0 && (
          <div className="border border-border" style={{ background: 'hsl(var(--background))' }}>
            {[
              { label: 'PRICE',    value: fmt(price) },
              { label: 'FEE',      value: `${fmt(amount * FEE)} USDG (0.1%)` },
              { label: 'YOU GET',  value: `${sharesOut.toFixed(6)} ${symbol}`, highlight: true },
            ].map((r, i, a) => (
              <div key={r.label} className="flex items-center justify-between px-3 py-1.5"
                style={{ borderBottom: i < a.length - 1 ? '1px solid hsl(var(--border))' : 'none' }}>
                <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>{r.label}</span>
                <span style={{ fontSize: '9px', fontWeight: (r as any).highlight ? 700 : 500, fontFamily: 'var(--app-font-mono)', color: (r as any).highlight ? 'hsl(var(--success))' : 'hsl(var(--foreground))' }}>{r.value}</span>
              </div>
            ))}
          </div>
        )}

        <ErrBanner msg={error} />
        {!isConnected && (
          <div style={{ fontSize: '8px', letterSpacing: '0.08em', color: '#FFB800' }}>⚠ CONNECT WALLET TO SWAP</div>
        )}
        {shieldUsdg === 0 && isConnected && (
          <div style={{ fontSize: '8px', letterSpacing: '0.08em', color: '#FFB800' }}>
            ⚠ NO SHIELDED USDG —{' '}
            <Link href="/shield" style={{ color: '#4ade80', textDecoration: 'none' }}>SHIELD USDG FIRST →</Link>
          </div>
        )}

        <button type="button" onClick={handleSwap} disabled={!canSwap}
          style={{
            marginTop: 'auto', width: '100%', padding: '11px',
            background: !canSwap ? 'hsl(var(--border) / 0.4)' : 'rgba(74,222,128,0.12)',
            border: `1px solid ${!canSwap ? 'hsl(var(--border))' : 'rgba(74,222,128,0.4)'}`,
            fontSize: '9px', letterSpacing: '0.12em', fontWeight: 700,
            cursor: !canSwap ? 'not-allowed' : 'pointer',
            color: !canSwap ? 'hsl(var(--muted-foreground))' : '#4ade80',
            fontFamily: 'var(--app-font-mono)', transition: 'all 0.15s',
          }}>
          {!isConnected ? 'CONNECT WALLET'
            : wrongChain ? 'SWITCH NETWORK'
            : shieldUsdg === 0 ? 'NO SHIELDED USDG'
            : amount < 1 ? 'ENTER AMOUNT (MIN $1)'
            : overBalance ? 'INSUFFICIENT SHIELDED USDG'
            : `◎ SWAP ${fmt(amount)} USDG → ${sharesOut.toFixed(4)} ${symbol}`}
        </button>

        <div style={{ fontSize: '7.5px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground) / 0.6)', textAlign: 'center', lineHeight: 1.6 }}>
          ZK PROOF + 1 METAMASK SIGNATURE · POSITIONS VISIBLE AT /ORDERS
        </div>
      </div>
    </div>
  );
}

/* ─── Get USDG Panel (ETH → USDG via Uniswap V3) ───────────────── */
function GetUsdgPanel({ onGot }: { onGot?: () => void }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const b = useOnChainBalances();
  const { step, estimatedUsdg, quoting, txHash, error, swap, quote, reset } = useEthToUsdg();
  const [open, setOpen] = useState(false);
  const [rawEth, setRawEth] = useState('');

  const wrongChain = chainId !== 4663;
  const ethAmount = parseFloat(rawEth) || 0;
  const ethBalance = Number(b.ethBalance ?? 0n) / 1e18;
  const gasReserve = 0.002; // keep some ETH for gas
  const maxEth = Math.max(0, ethBalance - gasReserve);

  // Re-quote whenever input changes
  useEffect(() => {
    if (rawEth) quote(rawEth);
    else { /* no-op */ }
  }, [rawEth, quote]);

  const canSwap = isConnected && !wrongChain && ethAmount > 0 && ethAmount <= maxEth && step === 'idle';

  function handleEthChange(v: string) {
    setRawEth(v);
    if (step === 'error') reset();
  }

  async function handleSwap() {
    await swap(rawEth);
    onGot?.();
  }

  function handleReset() { reset(); setRawEth(''); }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between w-full border border-border px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
        style={{ background: 'hsl(var(--card))', cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <Zap style={{ width: 10, height: 10, color: 'hsl(var(--primary))' }} />
          <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--primary))', fontWeight: 700 }}>
            GET USDG
          </span>
          <span style={{ fontSize: '8px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))' }}>
            SWAP ETH → USDG
          </span>
        </div>
        <ChevronDown style={{ width: 11, height: 11, color: 'hsl(var(--muted-foreground))' }} />
      </button>
    );
  }

  // Done state
  if (step === 'done' && txHash) {
    return (
      <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Zap style={{ width: 10, height: 10, color: 'hsl(var(--primary))' }} />
            <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--primary))', fontWeight: 700 }}>GET USDG</span>
          </div>
          <span style={{ fontSize: '8px', color: 'hsl(var(--success))' }}>● CONFIRMED</span>
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle style={{ width: 14, height: 14, color: 'hsl(var(--success))' }} />
            <span style={{ fontSize: '9px', letterSpacing: '0.08em', color: 'hsl(var(--success))' }}>
              +{estimatedUsdg?.toFixed(2)} USDG received
            </span>
          </div>
          <a href={`https://robinhoodchain.blockscout.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1"
            style={{ fontSize: '8px', color: 'hsl(var(--primary))', textDecoration: 'none', letterSpacing: '0.06em' }}>
            VIEW TX <ExternalLink style={{ width: 7, height: 7 }} />
          </a>
          <button type="button" onClick={handleReset}
            style={{ fontSize: '8px', letterSpacing: '0.08em', background: 'none', border: '1px solid hsl(var(--border))', cursor: 'pointer', padding: '5px 10px', color: 'hsl(var(--foreground))', fontFamily: 'var(--app-font-mono)' }}>
            SWAP MORE
          </button>
        </div>
      </div>
    );
  }

  // Spinner states
  if (step === 'quoting' || step === 'wrapping' || step === 'approving' || step === 'confirming' || step === 'mining') {
    const labels: Record<string, string> = {
      quoting:    'FETCHING QUOTE…',
      wrapping:   'STEP 1/3 — WRAP ETH IN METAMASK…',
      approving:  'STEP 2/3 — APPROVE WETH IN METAMASK…',
      confirming: 'STEP 3/3 — CONFIRM SWAP IN METAMASK…',
      mining:     'BROADCASTING TX…',
    };
    return (
      <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Zap style={{ width: 10, height: 10, color: 'hsl(var(--primary))' }} />
            <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--primary))', fontWeight: 700 }}>GET USDG</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-3">
          <Loader2 style={{ width: 12, height: 12, color: 'hsl(var(--primary))' }} className="animate-spin" />
          <span style={{ fontSize: '8.5px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>{labels[step]}</span>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
      {/* Header */}
      <button type="button" onClick={() => setOpen(false)}
        className="flex items-center justify-between w-full border-b border-border px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
        style={{ background: 'transparent', cursor: 'pointer' }}>
        <div className="flex items-center gap-2">
          <Zap style={{ width: 10, height: 10, color: 'hsl(var(--primary))' }} />
          <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--primary))', fontWeight: 700 }}>GET USDG</span>
          <span style={{ fontSize: '8px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))' }}>
            VIA UNISWAP V3 · FEE 0.01%
          </span>
        </div>
        <ChevronDown style={{ width: 11, height: 11, color: 'hsl(var(--muted-foreground))', transform: 'rotate(180deg)' }} />
      </button>

      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Wrong chain warning */}
        {isConnected && wrongChain && (
          <div className="flex items-center gap-2 px-3 py-2 border" style={{ borderColor: 'rgba(255,184,0,0.3)', background: 'rgba(255,184,0,0.05)' }}>
            <AlertTriangle style={{ width: 10, height: 10, color: '#FFB800' }} />
            <span style={{ fontSize: '8px', letterSpacing: '0.08em', color: '#FFB800' }}>SWITCH TO ROBINHOOD CHAIN (4663)</span>
          </div>
        )}

        {/* FROM ETH */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>FROM</span>
            {isConnected && ethBalance > 0 && (
              <button type="button"
                onClick={() => handleEthChange(maxEth.toFixed(6))}
                style={{ fontSize: '7.5px', letterSpacing: '0.06em', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))' }}>
                MAX {maxEth.toFixed(4)} ETH
              </button>
            )}
          </div>
          <div className="flex items-center border border-border" style={{ background: 'hsl(var(--background))' }}>
            <input type="number" min="0" step="any" value={rawEth}
              onChange={e => handleEthChange(e.target.value)} placeholder="0.0000"
              style={{ flex: 1, padding: '9px 12px', background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', fontFamily: 'var(--app-font-mono)', color: 'hsl(var(--foreground))' }} />
            <span style={{ padding: '0 12px', fontSize: '9px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>ETH</span>
          </div>
        </div>

        {/* Arrow + quote */}
        <div className="flex items-center gap-2">
          <ArrowLeftRight style={{ width: 12, height: 12, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
          <div className="flex-1 border border-border flex items-center" style={{ background: 'hsl(var(--background) / 0.5)', padding: '8px 12px' }}>
            {quoting ? (
              <span style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground) / 0.5)', fontFamily: 'var(--app-font-mono)' }}>…</span>
            ) : (
              <span style={{ fontSize: '14px', fontFamily: 'var(--app-font-mono)', color: estimatedUsdg ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.4)' }}>
                {estimatedUsdg != null ? estimatedUsdg.toFixed(2) : '0.00'}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '9px', letterSpacing: '0.08em', color: 'hsl(var(--foreground))', fontWeight: 700 }}>USDG</span>
          </div>
        </div>

        {/* Rate info */}
        {estimatedUsdg != null && ethAmount > 0 && (
          <div style={{ fontSize: '7.5px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', lineHeight: 1.8 }}>
            RATE: 1 ETH ≈ {(estimatedUsdg / ethAmount).toFixed(2)} USDG · POOL FEE 0.01% · SLIPPAGE 0.5%
          </div>
        )}

        <ErrBanner msg={error} />

        {/* Swap button */}
        <button type="button" onClick={handleSwap} disabled={!canSwap}
          style={{
            width: '100%', padding: '10px',
            background: !canSwap ? 'hsl(var(--border) / 0.4)' : 'hsl(var(--primary) / 0.12)',
            border: `1px solid ${!canSwap ? 'hsl(var(--border))' : 'hsl(var(--primary) / 0.5)'}`,
            fontSize: '9px', letterSpacing: '0.12em', fontWeight: 700,
            cursor: !canSwap ? 'not-allowed' : 'pointer',
            color: !canSwap ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))',
            fontFamily: 'var(--app-font-mono)', transition: 'all 0.15s',
          }}>
          {!isConnected ? 'CONNECT WALLET'
            : wrongChain ? 'SWITCH NETWORK'
            : ethAmount <= 0 ? 'ENTER ETH AMOUNT'
            : ethAmount > maxEth ? `INSUFFICIENT ETH (KEEP ${gasReserve} FOR GAS)`
            : estimatedUsdg != null
              ? `SWAP ${rawEth} ETH → ${estimatedUsdg.toFixed(2)} USDG`
              : 'SWAP ETH → USDG'}
        </button>

        <div style={{ fontSize: '7px', letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground) / 0.5)', textAlign: 'center', lineHeight: 1.6 }}>
          UNISWAP V3 · WETH/USDG FEE-100 POOL · ROBINHOOD CHAIN 4663
        </div>
      </div>
    </div>
  );
}

/* ─── Order Panel (tabs: POSITIONS | SWAP) ──────────────────────── */
type TradeTab = 'positions' | 'swap';

function OrderPanel({ symbol, price, walletUsdg, shieldUsdg, marketStatus, tradeable, assetName }: {
  symbol: string; price: number; walletUsdg: number; shieldUsdg: number;
  marketStatus: ReturnType<typeof getMarketStatus>; tradeable: boolean; assetName?: string;
}) {
  const [tab, setTab] = useState<TradeTab>('positions');

  return (
    <div className="flex flex-col h-full border border-border" style={{ background: 'hsl(var(--card))' }}>
      {/* Tab bar */}
      <div className="grid grid-cols-2 border-b border-border flex-shrink-0">
        {([
          { id: 'positions' as const, icon: <TrendingUp style={{ width: 10, height: 10 }} />, label: 'POSITIONS' },
          { id: 'swap'      as const, icon: <ArrowLeftRight style={{ width: 10, height: 10 }} />, label: 'SWAP' },
        ] as const).map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className="flex items-center justify-center gap-1.5"
            style={{
              padding: '10px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--app-font-mono)',
              background: tab === t.id ? 'hsl(var(--primary) / 0.06)' : 'transparent',
              borderBottom: tab === t.id ? '2px solid hsl(var(--primary))' : '2px solid transparent',
              color: tab === t.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
              fontSize: '9px', letterSpacing: '0.1em', fontWeight: 700,
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'positions' ? (
          <PositionsForm symbol={symbol} price={price} walletUsdg={walletUsdg} shieldUsdg={shieldUsdg} />
        ) : (
          <SwapForm symbol={symbol} price={price} shieldUsdg={shieldUsdg} assetName={assetName} />
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────── */
export function TradePage() {
  const params = new URLSearchParams(window.location.search);
  const initialSymbol = params.get('symbol') || 'AAPL';

  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const b = useOnChainBalances();

  const { data: markets } = useListMarkets({ query: { queryKey: getListMarketsQueryKey() } });
  const [symbol, setSymbol] = useState(initialSymbol);

  const { data: detail } = useGetMarket(symbol, {
    query: { queryKey: getGetMarketQueryKey(symbol), refetchInterval: 15000 },
  });

  const marketAsset = markets?.find(m => m.symbol === symbol) || markets?.[0];
  const price = detail?.price ?? marketAsset?.price ?? 0;
  const change = detail?.change ?? marketAsset?.change ?? 0;
  const changePct = detail?.changePercent ?? marketAsset?.changePercent ?? 0;
  const isUp = change >= 0;

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListMarketsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMarketQueryKey(symbol) });
    }, 10000);
    return () => clearInterval(id);
  }, [queryClient, symbol]);

  const [marketStatus, setMarketStatus] = useState(getMarketStatus());
  useEffect(() => {
    const id = setInterval(() => setMarketStatus(getMarketStatus()), 30_000);
    return () => clearInterval(id);
  }, []);

  const caps = (detail as any)?.tradingCapabilities as { market: boolean; extended: boolean; overnight: boolean } | null | undefined;
  const multiplier = (detail as any)?.currentMultiplier as number | null | undefined;
  const isHalt = (detail as any)?.isTradingHalt as boolean | false;
  const tradeable = canTradeNow(caps, marketStatus);

  // Shield balance (from useShieldSpend but we want it here too for display)
  const { shieldedUsdg, syncing: shieldSyncing, syncFromChain } = useShieldSpend();
  const walletUsdg = b.usdgUsd;

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col gap-4">
      <div className="t-divider flex-shrink-0">
        <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'hsl(var(--muted-foreground))' }}>
          CONFIDENTIAL EXECUTION LAYER — TOKENIZED CAPITAL MARKETS
        </span>
      </div>

      <div className="flex-1 min-h-0 grid gap-4" style={{ gridTemplateColumns: '380px 1fr' }}>

        {/* ── LEFT ─────────────────────────────── */}
        <div className="flex flex-col gap-3 min-h-0">

          {/* Asset picker + price */}
          <div className="border border-border p-4 flex items-start justify-between flex-shrink-0" style={{ background: 'hsl(var(--card))' }}>
            <AssetPicker markets={markets ?? []} symbol={symbol} onChange={s => setSymbol(s)} />
            <div className="text-right flex-shrink-0">
              <div style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 3 }}>LIVE PRICE</div>
              <div className="t-num" style={{ fontSize: '22px', fontWeight: 600, color: 'hsl(var(--foreground))', lineHeight: 1 }}>
                {fmt(price)}
              </div>
              <div className="t-num" style={{ fontSize: '10px', marginTop: 3, color: isUp ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>
                {isUp ? '+' : ''}{changePct.toFixed(2)}%&nbsp;({isUp ? '+' : ''}{fmt(change)})
              </div>
            </div>
          </div>

          {/* Market session */}
          <div className="flex items-center justify-between px-3 py-2 border flex-shrink-0"
            style={{ borderColor: `${marketStatus.color}25`, background: `${marketStatus.color}08`, fontSize: '9px', letterSpacing: '0.1em' }}>
            <div className="flex items-center gap-2">
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                background: marketStatus.color,
                boxShadow: marketStatus.session === 'OPEN' ? `0 0 5px ${marketStatus.color}` : 'none',
              }} />
              <span style={{ color: marketStatus.color, fontWeight: 600 }}>{marketStatus.label}</span>
            </div>
            <div className="flex items-center gap-3" style={{ color: 'hsl(var(--muted-foreground))', fontSize: '8.5px' }}>
              {caps?.overnight && <span style={{ color: 'rgb(120,180,255)' }}>24H TOKEN</span>}
              {caps?.extended && !caps.overnight && <span style={{ color: '#FFB800' }}>EXTENDED HOURS</span>}
              {isHalt && <span style={{ color: 'hsl(var(--destructive))', fontWeight: 700 }}>⚠ TRADING HALT</span>}
            </div>
          </div>

          {/* Balances */}
          <div className="border border-border flex-shrink-0" style={{ background: 'hsl(var(--card))' }}>
            <div className="border-b border-border px-4 py-2 flex items-center justify-between">
              <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>BALANCES</span>
              <div className="flex items-center gap-3">
                {isConnected && !shieldSyncing && (
                  <button type="button" onClick={() => syncFromChain()}
                    title="Sync shielded balance from chain"
                    style={{ fontSize: '8px', letterSpacing: '0.08em', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', padding: 0, fontFamily: 'var(--app-font-mono)' }}>
                    ↻ SYNC SHIELD
                  </button>
                )}
                {isConnected && shieldSyncing && (
                  <span style={{ fontSize: '8px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>
                    SYNCING…
                  </span>
                )}
                {isConnected && address && (
                  <span style={{ fontSize: '8px', letterSpacing: '0.06em', color: 'hsl(var(--success))' }}>
                    ● {address.slice(0, 6)}..{address.slice(-4)}
                  </span>
                )}
              </div>
            </div>
            {!isConnected ? (
              <div className="px-4 py-3" style={{ fontSize: '9px', letterSpacing: '0.08em', color: '#FFB800' }}>
                ⚠ CONNECT WALLET TO VIEW BALANCE
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-px" style={{ background: 'hsl(var(--border))' }}>
                {[
                  { label: 'WALLET USDG', value: b.isLoading ? '…' : `$${walletUsdg.toFixed(2)}`, color: undefined },
                  { label: '◎ SHIELD USDG', value: shieldSyncing ? '…' : `$${shieldedUsdg.toFixed(2)}`, color: '#4ade80' },
                  { label: 'ETH (GAS)',   value: b.isLoading ? '…' : `${(Number(b.ethBalance) / 1e18).toFixed(4)}`, color: undefined },
                ].map(s => (
                  <div key={s.label} className="px-3 py-2.5" style={{ background: 'hsl(var(--card))' }}>
                    <div style={{ fontSize: '7.5px', letterSpacing: '0.08em', color: s.color ?? 'hsl(var(--muted-foreground))', marginBottom: 3 }}>{s.label}</div>
                    <div className="t-num" style={{ fontSize: '13px', fontWeight: 700, color: s.color ?? 'hsl(var(--foreground))' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Get USDG — ETH → USDG swap (always visible, swap disabled until connected) */}
          <div className="flex-shrink-0">
            <GetUsdgPanel />
          </div>

          {/* Order panel with tabs */}
          <div className="flex-1 min-h-0">
            <OrderPanel
              symbol={symbol}
              price={price}
              walletUsdg={walletUsdg}
              shieldUsdg={shieldedUsdg}
              marketStatus={marketStatus}
              tradeable={tradeable}
              assetName={marketAsset?.name}
            />
          </div>
        </div>

        {/* ── RIGHT: Market data + Chart ─────── */}
        <div className="flex flex-col gap-3 min-h-0">

          {/* Day stats */}
          <div className="border border-border grid grid-cols-7 flex-shrink-0" style={{ background: 'hsl(var(--card))' }}>
            {[
              { label: 'BID',        value: fmt(detail?.bid),          pos: true  },
              { label: 'ASK',        value: fmt(detail?.ask),          neg: true  },
              { label: 'PREV CLOSE', value: fmt(detail?.previousClose)              },
              { label: 'DAY HIGH',   value: fmt(detail?.dayHigh),      pos: true  },
              { label: 'DAY LOW',    value: fmt(detail?.dayLow),       neg: true  },
              { label: 'VOLUME',     value: fmtBig(detail?.volume)                  },
              { label: 'MULTIPLIER', value: multiplier != null && multiplier !== 1 ? `${multiplier}×` : '1×',
                special: multiplier != null && multiplier !== 1 },
            ].map((s, i) => (
              <div key={s.label} className="flex flex-col justify-center p-3"
                style={{ borderRight: i < 6 ? '1px solid hsl(var(--border))' : 'none' }}>
                <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 3 }}>{s.label}</div>
                <div className="t-num" style={{
                  fontSize: '12px', fontWeight: 600,
                  color: (s as any).special ? '#FFB800' : (s as any).pos ? 'hsl(var(--success) / 0.85)' : (s as any).neg ? 'hsl(var(--destructive) / 0.85)' : 'hsl(var(--foreground))',
                }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Oracle */}
          {detail?.contractAddress && (
            <div className="flex items-center justify-between border border-border px-3 py-2 flex-shrink-0" style={{ background: 'hsl(var(--card))' }}>
              <span style={{ fontSize: '8.5px', letterSpacing: '0.07em', color: 'rgb(120,180,255)', fontWeight: 700 }}>◈ CHAINLINK ORACLE</span>
              <a href={`https://robinhoodchain.blockscout.com/address/${detail.contractAddress}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 hover:opacity-80"
                style={{ fontSize: '8.5px', color: 'hsl(var(--primary))', textDecoration: 'none', letterSpacing: '0.06em' }}>
                CONTRACT <ExternalLink style={{ width: 8, height: 8 }} />
              </a>
            </div>
          )}

          {/* 52W range */}
          {detail?.low52w != null && detail?.high52w != null && (
            <div className="border border-border px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: 'hsl(var(--card))' }}>
              <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', flexShrink: 0 }}>52W</span>
              <span className="t-num" style={{ fontSize: '10px', color: 'hsl(var(--destructive) / 0.7)', flexShrink: 0 }}>{fmt(detail.low52w)}</span>
              <div style={{ flex: 1, height: '3px', background: 'hsl(var(--border))', position: 'relative' }}>
                {(() => {
                  const pct = Math.max(0, Math.min(100, ((price - detail.low52w!) / (detail.high52w! - detail.low52w!)) * 100));
                  return <div style={{ position: 'absolute', left: `${Math.max(0, pct - 3)}%`, width: '6px', height: '100%', background: 'hsl(var(--primary))', top: 0 }} />;
                })()}
              </div>
              <span className="t-num" style={{ fontSize: '10px', color: 'hsl(var(--success) / 0.7)', flexShrink: 0 }}>{fmt(detail.high52w)}</span>
            </div>
          )}

          {/* Chart */}
          <div className="border border-border flex-1 min-h-0" style={{ background: 'hsl(var(--card))' }}>
            <PriceChart symbol={symbol} prevClose={detail?.previousClose} />
          </div>
        </div>
      </div>
    </div>
  );
}
