import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, TrendingUp, ArrowLeftRight,
  PieChart, Clock, Wallet, ShieldCheck, ChevronDown, BookOpen, Home, X, Menu,
} from 'lucide-react';
import { useAccount, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { cn } from '@/lib/utils';
import { ConnectWalletButton } from '@/components/connect-wallet';
import { getMarketStatus, type MarketStatus } from '@/lib/market-status';
import { robinhoodChain } from '@/lib/wagmi';

const NAV_ITEMS = [
  { href: '/',          label: 'HOME',      icon: Home          },
  { href: '/dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
  { href: '/markets',   label: 'MARKETS',   icon: TrendingUp    },
  { href: '/trade',     label: 'TRADE',     icon: ArrowLeftRight },
  { href: '/portfolio', label: 'PORTFOLIO', icon: PieChart      },
  { href: '/orders',    label: 'ORDERS',    icon: Clock         },
  { href: '/wallet',    label: 'WALLET',    icon: Wallet        },
  { href: '/shield',    label: 'SHIELD',    icon: ShieldCheck   },
  { href: '/docs',      label: 'DOCS',      icon: BookOpen      },
];

const SIDEBAR_COLLAPSED = 52;
const SIDEBAR_EXPANDED  = 176;

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="t-num" style={{ fontSize: '10px', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))' }}>
      {time.toISOString().replace('T', ' ').slice(0, 19)} UTC
    </span>
  );
}

function MarketStatusPill({ status }: { status: MarketStatus }) {
  const dotStyle: React.CSSProperties = {
    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
    background: status.color,
    boxShadow: status.session === 'OPEN' ? `0 0 5px ${status.color}` : 'none',
  };
  return (
    <div
      className="hidden sm:flex items-center gap-1.5"
      title={status.description}
      style={{ fontSize: '9px', letterSpacing: '0.09em' }}
    >
      <span style={dotStyle} />
      <span style={{ color: status.color }}>{status.label}</span>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(getMarketStatus());
  useEffect(() => {
    const id = setInterval(() => setMarketStatus(getMarketStatus()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground dark overflow-hidden">

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="hidden md:flex flex-col border-r border-border bg-background flex-shrink-0 overflow-hidden"
        style={{
          width: expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
          transition: 'width 0.18s cubic-bezier(0.4,0,0.2,1)',
          zIndex: 40,
          position: 'relative',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center border-b border-border flex-shrink-0 overflow-hidden"
          style={{ height: '52px', paddingLeft: '14px', paddingRight: '10px', gap: '10px' }}
        >
          {/* Logo image */}
          <img
            src="/viona-logo.jpg"
            alt="VIONA"
            className="flex-shrink-0"
            style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '2px' }}
          />

          {/* Wordmark — slides in */}
          <div
            className="overflow-hidden flex-shrink-0"
            style={{
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '120px' : '0px',
              transition: 'opacity 0.15s, max-width 0.18s cubic-bezier(0.4,0,0.2,1)',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', color: 'hsl(var(--foreground))' }}>
                VIONA
              </span>
              <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.22em', color: 'hsl(var(--primary))' }}>
                LAYER
              </span>
            </div>
            <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground) / 0.5)', marginTop: '1px' }}>
              CONFIDENTIAL EXECUTION
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-hidden">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center transition-colors duration-100 relative overflow-hidden',
                  isActive
                    ? 'text-foreground bg-white/[0.05]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
                )}
                style={{
                  height: '40px',
                  paddingLeft: '14px',
                  paddingRight: '10px',
                  gap: '12px',
                  width: '100%',
                }}
              >
                {/* Active bar */}
                {isActive && (
                  <span
                    className="absolute left-0 top-2 bottom-2"
                    style={{ width: '2px', background: 'hsl(var(--primary))', borderRadius: '0 2px 2px 0' }}
                  />
                )}

                {/* Icon — always visible, centred in the 52px slot */}
                <Icon
                  style={{
                    width: '15px',
                    height: '15px',
                    flexShrink: 0,
                    color: isActive ? 'hsl(var(--primary))' : undefined,
                    opacity: isActive ? 1 : 0.55,
                  }}
                />

                {/* Label — fades in */}
                <span
                  className="overflow-hidden whitespace-nowrap"
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                    fontWeight: isActive ? 600 : 400,
                    opacity: expanded ? 1 : 0,
                    maxWidth: expanded ? '110px' : '0px',
                    transition: 'opacity 0.12s, max-width 0.18s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Docs link — above wallet */}
        <Link
          href="/docs"
          className={cn(
            'flex items-center border-t border-border transition-colors duration-100 overflow-hidden',
            location === '/docs'
              ? 'text-foreground bg-white/[0.05]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
          )}
          style={{ height: '40px', paddingLeft: '14px', gap: '12px', flexShrink: 0, textDecoration: 'none' }}
        >
          <BookOpen style={{ width: '15px', height: '15px', flexShrink: 0 }} />
          <span
            className="overflow-hidden whitespace-nowrap"
            style={{
              fontSize: '10px', letterSpacing: '0.1em',
              fontWeight: location === '/docs' ? 600 : 400,
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '110px' : '0px',
              transition: 'opacity 0.12s, max-width 0.18s cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            DOCS
          </span>
        </Link>

        {/* Wallet connect — collapses to icon strip */}
        <div
          className="border-t border-border overflow-hidden"
          style={{ padding: '8px', minHeight: '52px' }}
        >
          {expanded ? (
            <ConnectWalletButton />
          ) : (
            <WalletIconButton />
          )}
        </div>

        {/* Footer status */}
        <div
          className="border-t border-border flex items-center overflow-hidden"
          style={{ height: '32px', paddingLeft: '17px', gap: '8px' }}
        >
          <span className="t-dot-green t-blink flex-shrink-0" />
          <span
            className="overflow-hidden whitespace-nowrap"
            style={{
              fontSize: '8px',
              letterSpacing: '0.1em',
              color: 'hsl(var(--muted-foreground) / 0.45)',
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '120px' : '0px',
              transition: 'opacity 0.12s, max-width 0.18s cubic-bezier(0.4,0,0.2,1)',
            }}
          >
            CAPITAL MOVES IN SILENCE
          </span>
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header
          className="flex items-center justify-between px-5 border-b border-border flex-shrink-0"
          style={{ height: '38px', background: 'hsl(var(--background))' }}
        >
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-2">
            <img src="/viona-logo.jpg" alt="VIONA" style={{ width: '20px', height: '20px', objectFit: 'cover', borderRadius: '2px' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em' }}>VIONA</span>
            <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.2em', color: 'hsl(var(--primary))' }}>LAYER</span>
          </div>

          {/* Breadcrumb */}
          <div className="hidden md:flex items-center gap-2" style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>
            <span style={{ color: 'hsl(var(--primary))' }}>VIONA</span>
            <span style={{ opacity: 0.4 }}>/</span>
            <span>{NAV_ITEMS.find(n => n.href === location)?.label ?? 'TERMINAL'}</span>
          </div>

          {/* Right: network + market status + clock + wallet */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5" style={{ fontSize: '9px', letterSpacing: '0.08em' }}>
              <span className="t-dot-green" style={{ flexShrink: 0 }} />
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>ROBINHOOD CHAIN</span>
            </div>
            <MarketStatusPill status={marketStatus} />
            <span className="hidden md:block"><LiveClock /></span>
            <HeaderWalletButton />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-5">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile FAB Nav ────────────────────────────────────────── */}
      <MobileFabNav location={location} />
    </div>
  );
}

/** Small icon-only wallet indicator shown when sidebar is collapsed */
function WalletIconButton() {
  const { isConnected } = useAccount();
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: '36px', height: '36px', cursor: 'default' }}
      title={isConnected ? 'Wallet connected' : 'Connect wallet (hover sidebar)'}
    >
      <Wallet
        style={{
          width: '15px', height: '15px',
          color: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.4)',
        }}
      />
    </div>
  );
}

/** Compact wallet button in the top header bar */
function HeaderWalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const wrongChain = isConnected && chainId !== robinhoodChain.id;

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* ── Not connected: just a button that opens the sidebar picker ── */
  if (!isConnected) {
    return (
      <Link href="/wallet">
        <button
          type="button"
          className="flex items-center gap-1.5 transition-all"
          style={{
            height: '26px',
            padding: '0 10px',
            background: 'hsl(var(--primary) / 0.10)',
            border: '1px solid hsl(var(--primary) / 0.4)',
            color: 'hsl(var(--primary))',
            fontSize: '8.5px', letterSpacing: '0.14em', fontWeight: 700,
            fontFamily: 'var(--app-font-mono)', cursor: 'pointer',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--primary) / 0.18)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--primary) / 0.10)';
          }}
        >
          <Wallet style={{ width: '10px', height: '10px', flexShrink: 0 }} />
          CONNECT
        </button>
      </Link>
    );
  }

  /* ── Connected: address pill with dropdown ─────────────────────── */
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 transition-all"
        style={{
          height: '26px',
          padding: '0 8px',
          background: wrongChain ? 'rgba(255,184,0,0.06)' : 'hsl(var(--primary) / 0.06)',
          border: `1px solid ${wrongChain ? 'rgba(255,184,0,0.35)' : 'hsl(var(--primary) / 0.3)'}`,
          color: wrongChain ? '#FFB800' : 'hsl(var(--primary))',
          fontSize: '8.5px', letterSpacing: '0.1em', fontWeight: 600,
          fontFamily: 'var(--app-font-mono)', cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
            background: wrongChain ? '#FFB800' : 'hsl(var(--primary))',
            boxShadow: wrongChain ? '0 0 4px #FFB800' : '0 0 4px hsl(var(--primary))',
          }}
        />
        <span className="t-num">{address!.slice(0, 6)}…{address!.slice(-4)}</span>
        {wrongChain && <span style={{ fontSize: '7px', letterSpacing: '0.06em' }}>⚠</span>}
        <ChevronDown style={{ width: '9px', height: '9px', opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 4px)',
            width: '220px', zIndex: 100,
            background: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* Address */}
          <div className="px-3 py-2.5 border-b border-border">
            <div style={{ fontSize: '7.5px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>
              CONNECTED WALLET
            </div>
            <div className="t-num" style={{ fontSize: '9px', color: 'hsl(var(--foreground))', wordBreak: 'break-all', lineHeight: 1.5 }}>
              {address}
            </div>
          </div>

          {/* Chain status */}
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span style={{ fontSize: '7.5px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>NETWORK</span>
            <span style={{
              fontSize: '8px', letterSpacing: '0.08em', fontWeight: 600,
              color: wrongChain ? '#FFB800' : 'hsl(var(--success))',
            }}>
              {wrongChain ? '⚠ WRONG CHAIN' : '✓ ROBINHOOD CHAIN'}
            </span>
          </div>

          {/* Actions */}
          <div className="p-2 space-y-1">
            {wrongChain && (
              <button
                type="button"
                onClick={() => { switchChain({ chainId: robinhoodChain.id }); setOpen(false); }}
                disabled={isSwitching}
                className="w-full flex items-center justify-center gap-1.5 py-2 transition-all disabled:opacity-50"
                style={{
                  fontSize: '8.5px', letterSpacing: '0.1em', fontWeight: 700,
                  color: '#FFB800', background: 'rgba(255,184,0,0.07)',
                  border: '1px solid rgba(255,184,0,0.35)', cursor: 'pointer',
                  fontFamily: 'var(--app-font-mono)',
                }}
              >
                ⚡ {isSwitching ? 'SWITCHING…' : 'SWITCH TO ROBINHOOD CHAIN'}
              </button>
            )}
            <Link href="/wallet" onClick={() => setOpen(false)} style={{ textDecoration: 'none', display: 'block' }}>
              <button
                type="button"
                className="w-full flex items-center justify-center gap-1.5 py-2 transition-all"
                style={{
                  fontSize: '8.5px', letterSpacing: '0.1em', fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))', cursor: 'pointer',
                  fontFamily: 'var(--app-font-mono)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(var(--primary) / 0.4)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(var(--border))'; }}
              >
                <Wallet style={{ width: '9px', height: '9px' }} />
                WALLET PAGE
              </button>
            </Link>
            <button
              type="button"
              onClick={() => { disconnect(); setOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 py-2 transition-all"
              style={{
                fontSize: '8.5px', letterSpacing: '0.1em', fontWeight: 600,
                color: 'hsl(var(--destructive) / 0.75)',
                background: 'hsl(var(--destructive) / 0.04)',
                border: '1px solid hsl(var(--border))', cursor: 'pointer',
                fontFamily: 'var(--app-font-mono)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--destructive))';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(var(--destructive) / 0.4)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--destructive) / 0.75)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(var(--border))';
              }}
            >
              ✕ DISCONNECT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mobile FAB navigation ────────────────────────────────────── */
const FAB_ITEMS = [
  { href: '/',          icon: Home,            label: 'HOME'      },
  { href: '/dashboard', icon: LayoutDashboard, label: 'DASHBOARD' },
  { href: '/markets',   icon: TrendingUp,      label: 'MARKETS'   },
  { href: '/trade',     icon: ArrowLeftRight,  label: 'TRADE'     },
  { href: '/portfolio', icon: PieChart,        label: 'PORTFOLIO' },
  { href: '/orders',    icon: Clock,           label: 'ORDERS'    },
  { href: '/wallet',    icon: Wallet,          label: 'WALLET'    },
  { href: '/shield',    icon: ShieldCheck,     label: 'SHIELD'    },
  { href: '/docs',      icon: BookOpen,        label: 'DOCS'      },
];

function MobileFabNav({ location }: { location: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [location]);

  const activeItem = FAB_ITEMS.find(i => i.href === location);
  const ActiveIcon = activeItem?.icon ?? Menu;

  return (
    <div
      ref={ref}
      className="md:hidden"
      style={{
        position: 'fixed',
        bottom: 'calc(24px + env(safe-area-inset-bottom))',
        right: 20,
        zIndex: 60,
      }}
    >
      {/* Backdrop blur overlay when open */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: -1,
            background: 'hsl(var(--background) / 0.6)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Menu items */}
      <div
        style={{
          position: 'absolute',
          bottom: 64,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {FAB_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          const delay = open ? i * 30 : (FAB_ITEMS.length - 1 - i) * 18;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: open ? 1 : 0,
                  transform: open ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.9)',
                  transition: `opacity 0.22s ease ${delay}ms, transform 0.22s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
                }}
              >
                <span
                  style={{
                    fontSize: '9px', letterSpacing: '0.14em',
                    fontFamily: 'var(--app-font-mono)', fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                    background: 'hsl(var(--background) / 0.95)',
                    border: `1px solid ${isActive ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border))'}`,
                    padding: '5px 12px', whiteSpace: 'nowrap',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {item.label}
                </span>
                <div
                  style={{
                    width: 40, height: 40, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'hsl(var(--primary))' : 'hsl(var(--card))',
                    border: `1px solid ${isActive ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                    boxShadow: isActive
                      ? '0 0 14px hsl(var(--primary) / 0.4)'
                      : '0 2px 10px rgba(0,0,0,0.45)',
                  }}
                >
                  <Icon style={{ width: 15, height: 15, color: isActive ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))' }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* FAB button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: 52, height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'hsl(var(--card))' : 'hsl(var(--primary))',
          border: `1px solid ${open ? 'hsl(var(--border))' : 'hsl(var(--primary) / 0.8)'}`,
          boxShadow: open ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 24px hsl(var(--primary) / 0.4)',
          cursor: 'pointer', position: 'relative', zIndex: 1,
          transition: 'background 0.2s, box-shadow 0.2s, transform 0.15s',
          transform: open ? 'rotate(0deg)' : 'rotate(0deg)',
        }}
      >
        <div style={{ transition: 'transform 0.25s, opacity 0.2s', transform: open ? 'rotate(45deg) scale(1)' : 'rotate(0deg) scale(1)' }}>
          {open
            ? <X style={{ width: 18, height: 18, color: 'hsl(var(--foreground))' }} />
            : <ActiveIcon style={{ width: 18, height: 18, color: 'hsl(var(--background))' }} />
          }
        </div>
      </button>
    </div>
  );
}
