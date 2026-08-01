import React, { useState } from 'react';
import { useAccount, useReadContract, useChainId } from 'wagmi';
import { robinhoodChain } from '@/lib/wagmi';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { Link } from 'wouter';
import { USDG_ADDRESS, ERC20_ABI } from '@/lib/wagmi';
import { ConnectWalletButton } from '@/components/connect-wallet';
import { useOnChainBalances } from '@/lib/use-onchain-balances';

function fmtUSDG(n: bigint | undefined): string {
  if (n == null) return '—';
  return (Number(n) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 2, display: 'flex', alignItems: 'center' }}
    >
      {copied
        ? <Check style={{ width: 10, height: 10, color: 'hsl(var(--success))' }} />
        : <Copy style={{ width: 10, height: 10 }} />}
    </button>
  );
}

function OnChainPanel({ address, chainId }: { address: `0x${string}`; chainId: number }) {
  const usdcAddr = USDG_ADDRESS[chainId];
  const { data: rawBalance, isLoading } = useReadContract(
    usdcAddr ? { address: usdcAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] } : (undefined as any)
  );
  const explorerBase = chainId === robinhoodChain.id ? 'https://robinhoodchain.blockscout.com' : chainId === 8453 ? 'https://basescan.org' : 'https://etherscan.io';

  return (
    <div className="space-y-4">
      <div>
        <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>USDG BALANCE</div>
        {isLoading ? (
          <div className="h-8 w-36 animate-pulse" style={{ background: 'hsl(var(--border))' }} />
        ) : !usdcAddr ? (
          <div style={{ fontSize: '10px', color: '#FFB800' }}>⚠ UNAVAILABLE ON THIS NETWORK</div>
        ) : (
          <div className="t-num" style={{ fontSize: '28px', fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1 }}>
            {fmtUSDG(rawBalance as bigint | undefined)}
            <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', marginLeft: 6, fontWeight: 400 }}>USDG</span>
          </div>
        )}
      </div>

      <div className="border border-border p-3 space-y-2" style={{ background: 'hsl(var(--background))' }}>
        {[
          { label: 'WALLET', value: `${address.slice(0, 8)}…${address.slice(-6)}`, copy: address },
          usdcAddr ? { label: 'USDG', value: `${usdcAddr.slice(0, 8)}…${usdcAddr.slice(-6)}`, copy: usdcAddr } : null,
        ].filter(Boolean).map(row => (
          <div key={row!.label} className="flex items-center justify-between">
            <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>{row!.label}</span>
            <div className="flex items-center gap-1">
              <span className="t-num" style={{ fontSize: '9px', color: 'hsl(var(--foreground))' }}>{row!.value}</span>
              <CopyButton text={row!.copy} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <a href={`${explorerBase}/address/${address}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:opacity-70"
          style={{ fontSize: '8.5px', letterSpacing: '0.08em', color: 'hsl(var(--primary))', textDecoration: 'none' }}>
          <ExternalLink style={{ width: 9, height: 9 }} /> VIEW ON EXPLORER
        </a>
        {usdcAddr && (
          <a href={`${explorerBase}/token/${usdcAddr}?a=${address}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:opacity-70"
            style={{ fontSize: '8.5px', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', textDecoration: 'none' }}>
            <ExternalLink style={{ width: 9, height: 9 }} /> USDG TRANSFERS
          </a>
        )}
      </div>
    </div>
  );
}

export function WalletPage() {
  const { address, isConnected, chainId } = useAccount();
  const b = useOnChainBalances();

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col gap-3">

      <div className="t-divider flex-shrink-0">
        <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'hsl(var(--muted-foreground))' }}>WALLET MANAGEMENT</span>
      </div>

      <div className="flex-1 min-h-0 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* LEFT */}
        <div className="flex flex-col gap-3">

          {/* Blockchain wallet */}
          <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>BLOCKCHAIN WALLET</span>
              <div className="flex items-center gap-1.5" style={{
                fontSize: '9px', letterSpacing: '0.1em',
                color: isConnected ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))',
              }}>
                <span className={isConnected ? 't-dot-green' : 't-dot-dim'} />
                {isConnected ? 'CONNECTED' : 'NOT CONNECTED'}
              </div>
            </div>
            <div className="p-4">
              {isConnected && address ? (
                <OnChainPanel address={address} chainId={chainId} />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-px" style={{ background: 'hsl(var(--border))' }}>
                    {[
                      { icon: '◈', label: 'ON-CHAIN BALANCE' },
                      { icon: '✍', label: 'EIP-191 SIGNING' },
                      { icon: '⬡', label: 'NETWORK VERIFY' },
                      { icon: '↗', label: 'BLOCK EXPLORER' },
                    ].map(item => (
                      <div key={item.label} className="p-2.5 flex items-center gap-1.5" style={{ background: 'hsl(var(--background))' }}>
                        <span style={{ fontSize: '9px', color: 'hsl(var(--primary) / 0.5)', fontFamily: 'var(--app-font-mono)' }}>{item.icon}</span>
                        <span style={{ fontSize: '7.5px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <ConnectWalletButton />
                </div>
              )}
            </div>
          </div>

          {/* Network details */}
          <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
            <div className="border-b border-border px-4 py-3">
              <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>NETWORK DETAILS</span>
            </div>
            <div className="p-4 space-y-2.5">
              {[
                { label: 'CHAIN',      value: 'Robinhood Chain' },
                { label: 'CHAIN ID',   value: '4663', mono: true },
                { label: 'LAYER',      value: 'Arbitrum Nitro (L2)' },
                { label: 'GAS TOKEN',  value: 'ETH' },
                { label: 'SETTLEMENT', value: 'EIP-191' },
                { label: 'USDG',       value: '0x5fc5360D…716F1d168', mono: true, copy: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', link: 'https://robinhoodchain.blockscout.com/token/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' },
                { label: 'RPC',        value: 'rpc.mainnet.chain.robinhood.com', mono: true, copy: 'https://rpc.mainnet.chain.robinhood.com/' },
                { label: 'EXPLORER',   value: 'robinhoodchain.blockscout.com', mono: true, link: 'https://robinhoodchain.blockscout.com' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <span style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))' }}>{row.label}</span>
                  <div className="flex items-center gap-1">
                    {row.link ? (
                      <a href={row.link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:opacity-70"
                        style={{ fontSize: '9px', color: 'hsl(var(--primary))', textDecoration: 'none' }}>
                        {row.value} <ExternalLink style={{ width: 8, height: 8 }} />
                      </a>
                    ) : (
                      <span className={row.mono ? 't-num' : ''} style={{ fontSize: '9px', color: 'hsl(var(--foreground))' }}>{row.value}</span>
                    )}
                    {row.copy && <CopyButton text={row.copy} />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bridge */}
          <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>BRIDGE TO ROBINHOOD CHAIN</span>
              <a href="https://docs.robinhood.com/chain/bridging/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 hover:opacity-70"
                style={{ fontSize: '8.5px', color: 'hsl(var(--primary))', textDecoration: 'none', letterSpacing: '0.08em' }}>
                DOCS <ExternalLink style={{ width: 8, height: 8 }} />
              </a>
            </div>
            <div className="p-4 space-y-2">
              {[
                { step: '01', label: 'Bridge ETH' },
                { step: '02', label: 'Bridge USDG' },
                { step: '03', label: '7-day withdrawal window' },
              ].map(item => (
                <div key={item.step} className="flex items-center gap-3">
                  <span style={{ fontSize: '8px', letterSpacing: '0.12em', color: 'hsl(var(--primary))', fontWeight: 700, flexShrink: 0, fontFamily: 'var(--app-font-mono)' }}>
                    {item.step}
                  </span>
                  <span style={{ fontSize: '8.5px', letterSpacing: '0.06em', color: 'hsl(var(--foreground))' }}>{item.label}</span>
                </div>
              ))}
              <a href="https://bridge.robinhood.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 hover:opacity-80 transition-opacity"
                style={{
                  display: 'flex', marginTop: 8, padding: '8px 0',
                  border: '1px solid hsl(var(--primary) / 0.3)',
                  background: 'hsl(var(--primary) / 0.06)',
                  fontSize: '9px', letterSpacing: '0.12em', fontWeight: 600,
                  color: 'hsl(var(--primary))', textDecoration: 'none', fontFamily: 'var(--app-font-mono)',
                }}>
                OPEN BRIDGE <ExternalLink style={{ width: 9, height: 9 }} />
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-3">

          {/* On-chain balance */}
          <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))' }}>ON-CHAIN BALANCE</span>
              {isConnected && address && (
                <span style={{ fontSize: '8px', letterSpacing: '0.06em', color: 'hsl(var(--success))' }}>
                  <span className="t-dot-green" /> {address.slice(0, 6)}..{address.slice(-4)}
                </span>
              )}
            </div>
            {!isConnected ? (
              <div className="px-4 py-4" style={{ fontSize: '9px', letterSpacing: '0.1em', color: '#FFB800' }}>
                ⚠ CONNECT WALLET TO VIEW BALANCE
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div>
                  <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>TOTAL VALUE</div>
                  <div>
                    <span className="t-num" style={{ fontSize: '32px', fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1 }}>
                      {b.isLoading ? '…' : `$${b.totalUsd.toFixed(2)}`}
                    </span>
                    <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', marginLeft: 6, fontWeight: 400 }}>USD</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px" style={{ background: 'hsl(var(--border))' }}>
                  {[
                    { label: 'USDG', value: b.isLoading ? '…' : `$${b.usdgUsd.toFixed(2)}` },
                    { label: 'ETH',  value: b.isLoading ? '…' : `${(Number(b.ethBalance) / 1e18).toFixed(4)} ETH` },
                  ].map(col => (
                    <div key={col.label} className="p-3" style={{ background: 'hsl(var(--card))' }}>
                      <div style={{ fontSize: '8px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>{col.label}</div>
                      <div className="t-num" style={{ fontSize: '13px', fontWeight: 700, color: 'hsl(var(--foreground))' }}>{col.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick nav */}
          <div className="border border-border" style={{ background: 'hsl(var(--card))' }}>
            <div className="grid grid-cols-2 gap-px" style={{ background: 'hsl(var(--border))' }}>
              <Link href="/trade" style={{ textDecoration: 'none' }}>
                <div className="p-4 hover:bg-white/[0.02] transition-colors cursor-pointer" style={{ background: 'hsl(var(--card))' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.14em', fontWeight: 700, color: 'hsl(var(--primary))' }}>⚡ TRADE →</div>
                </div>
              </Link>
              <Link href="/shield" style={{ textDecoration: 'none' }}>
                <div className="p-4 hover:bg-green-950/20 transition-colors cursor-pointer" style={{ background: 'hsl(var(--card))' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.14em', fontWeight: 700, color: '#4ade80' }}>◎ SHIELD →</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Security */}
          <div className="border border-border px-4 py-3 space-y-1.5" style={{ background: 'hsl(var(--card))' }}>
            <div style={{ fontSize: '8.5px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>SECURITY</div>
            {[
              'EIP-191 order signing',
              'Server-side signature verification',
              'Non-custodial — keys never leave device',
              'Settlement on Chain ID 4663',
            ].map(line => (
              <div key={line} className="flex items-center gap-2">
                <span style={{ color: 'hsl(var(--success))', fontSize: '9px', flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: '8px', letterSpacing: '0.04em', color: 'hsl(var(--muted-foreground) / 0.65)' }}>{line}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
