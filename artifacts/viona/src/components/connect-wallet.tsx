import React, { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { cn } from '@/lib/utils';
import { robinhoodChain } from '@/lib/wagmi';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function truncate(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  /* ── NOT connected ──────────────────────────────────────── */
  if (!isConnected) {
    if (showPicker) {
      return (
        <div className="space-y-1.5">
          <div style={{
            fontSize: '8px', letterSpacing: '0.14em',
            color: 'hsl(var(--muted-foreground))', marginBottom: 8,
            fontFamily: 'var(--app-font-mono)',
          }}>
            SELECT WALLET PROVIDER
          </div>
          {connectors.length === 0 ? (
            <div style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.06em', padding: '8px 0' }}>
              No wallet detected. Install MetaMask or a compatible browser extension.
            </div>
          ) : (
            connectors.map((c) => (
              <button
                key={c.uid}
                type="button"
                onClick={() => {
                  connect(
                    { connector: c },
                    {
                      onSuccess: () => setShowPicker(false),
                      onError: (err) => {
                        const msg = (err as { message?: string })?.message ?? 'Connection failed';
                        const isRejected = msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('user');
                        toast({
                          title: isRejected ? 'Connection rejected' : 'Connection failed',
                          description: isRejected ? 'You rejected the wallet connection.' : msg,
                          variant: 'destructive',
                        });
                      },
                    }
                  );
                }}
                disabled={isPending}
                className="w-full flex items-center gap-3 px-3 py-2.5 border border-border hover:border-primary/50 disabled:opacity-40 transition-all text-left"
                style={{
                  fontSize: '10px', letterSpacing: '0.08em',
                  color: 'hsl(var(--foreground))', fontFamily: 'var(--app-font-mono)',
                  background: 'hsl(var(--background))', cursor: 'pointer',
                }}
              >
                <span style={{ color: 'hsl(var(--primary))', fontSize: '11px', width: 18, textAlign: 'center', flexShrink: 0 }}>
                  ⬡
                </span>
                <span className="flex-1">{c.name}</span>
                {isPending
                  ? <Loader2 style={{ width: 10, height: 10, color: 'hsl(var(--muted-foreground))', animation: 'spin 1s linear infinite' }} />
                  : <span style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground) / 0.4)' }}>›</span>
                }
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="w-full mt-1 text-left"
            style={{
              fontSize: '8px', letterSpacing: '0.1em',
              color: 'hsl(var(--muted-foreground) / 0.45)',
              fontFamily: 'var(--app-font-mono)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            [ESC] CANCEL
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="w-full flex items-center justify-center gap-2.5 transition-all group"
        style={{
          padding: '13px 16px',
          background: 'hsl(var(--primary) / 0.10)',
          border: '1px solid hsl(var(--primary) / 0.45)',
          color: 'hsl(var(--primary))',
          fontSize: '10px', letterSpacing: '0.18em', fontWeight: 700,
          fontFamily: 'var(--app-font-mono)', cursor: 'pointer',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--primary) / 0.18)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(var(--primary) / 0.75)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--primary) / 0.10)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(var(--primary) / 0.45)';
        }}
      >
        <span style={{ fontSize: '13px', lineHeight: 1 }}>⬡</span>
        CONNECT WALLET
        <span style={{ fontSize: '9px', opacity: 0.55, marginLeft: 2 }}>→</span>
      </button>
    );
  }

  /* ── Connected ──────────────────────────────────────────── */
  const wrongChain = chainId !== robinhoodChain.id;

  return (
    <div className="space-y-2">
      {/* Address row */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 border"
        style={{
          borderColor: wrongChain ? 'rgba(255,184,0,0.3)' : 'hsl(var(--primary) / 0.25)',
          background: wrongChain ? 'rgba(255,184,0,0.04)' : 'hsl(var(--primary) / 0.05)',
          fontFamily: 'var(--app-font-mono)',
        }}
      >
        <span
          className={cn('t-dot-green', !wrongChain && 't-blink')}
          style={wrongChain ? { background: '#FFB800', boxShadow: '0 0 4px #FFB800' } : {}}
        />
        <span className="t-num flex-1" style={{ fontSize: '9.5px', color: 'hsl(var(--foreground))' }}>
          {truncate(address!)}
        </span>
        <span style={{
          fontSize: '7.5px', letterSpacing: '0.08em', fontWeight: 600,
          color: wrongChain ? '#FFB800' : 'hsl(var(--primary))',
        }}>
          {wrongChain ? '⚠ WRONG CHAIN' : '✓ ROBINHOOD CHAIN'}
        </span>
      </div>

      {/* Full address (dimmed) */}
      <div className="t-num px-1" style={{ fontSize: '7.5px', color: 'hsl(var(--muted-foreground) / 0.45)', wordBreak: 'break-all', lineHeight: 1.5 }}>
        {address}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {wrongChain && (
          <button
            type="button"
            onClick={() => switchChain({ chainId: robinhoodChain.id })}
            disabled={isSwitching}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 transition-all disabled:opacity-50"
            style={{
              fontSize: '9px', letterSpacing: '0.1em', fontWeight: 700,
              color: '#FFB800', background: 'rgba(255,184,0,0.07)',
              border: '1px solid rgba(255,184,0,0.35)', cursor: 'pointer',
              fontFamily: 'var(--app-font-mono)',
            }}
          >
            {isSwitching
              ? <><Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> SWITCHING…</>
              : <>⚡ SWITCH CHAIN</>
            }
          </button>
        )}
        <button
          type="button"
          onClick={() => disconnect()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-border hover:border-destructive/40 transition-all"
          style={{
            fontSize: '9px', letterSpacing: '0.1em', fontWeight: 600,
            color: 'hsl(var(--destructive) / 0.75)',
            background: 'hsl(var(--destructive) / 0.04)',
            cursor: 'pointer', fontFamily: 'var(--app-font-mono)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--destructive))'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--destructive) / 0.75)'; }}
        >
          ✕ DISCONNECT
        </button>
      </div>
    </div>
  );
}
