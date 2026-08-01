import React, { useState } from 'react';
import { Link } from 'wouter';

type Section = {
  id: string;
  title: string;
  content: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: 'Overview',
    content: (
      <div className="space-y-4">
        <p>
          VIONA is a confidential execution layer for tokenized capital markets, deployed on Robinhood Chain (chain ID 4663).
          It lets you trade synthetic positions on real-world assets — stocks, ETFs, commodities — using USDG as collateral,
          with optional ZK-privacy via the VIONA Shield pool.
        </p>
        <div className="grid grid-cols-1 gap-3" style={{ marginTop: 16 }}>
          {[
            { label: 'CHAIN', value: 'Robinhood Chain — Chain ID 4663' },
            { label: 'COLLATERAL', value: 'USDG (Paxos Global Dollar, 6 decimals)' },
            { label: 'MODEL', value: 'CFD — Contract for Difference, no DEX needed' },
            { label: 'PRIVACY', value: 'UltraHonk ZK proofs via VIONA Shield pool' },
            { label: 'ORACLE', value: 'VIONAPriceFeed — updated on-chain every ~90 seconds' },
            { label: 'ASSETS', value: '96 tokenized stocks, ETFs & crypto' },
          ].map(r => (
            <div key={r.label} className="flex gap-3 items-start" style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: 8 }}>
              <span style={{ fontSize: '8px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground))', minWidth: 90, paddingTop: 2 }}>{r.label}</span>
              <span style={{ fontSize: '11px', color: 'hsl(var(--foreground))' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'quickstart',
    title: 'Quick Start',
    content: (
      <div className="space-y-5">
        <p>Follow these four steps to place your first trade on VIONA.</p>
        {[
          {
            step: '01',
            title: 'Connect MetaMask',
            body: 'Click CONNECT in the top-right corner. VIONA requires MetaMask (or any EIP-1193 wallet). After connecting, switch to Robinhood Chain — VIONA will prompt you to add it automatically.',
          },
          {
            step: '02',
            title: 'Get USDG',
            body: 'Open the Trade page and expand the GET USDG panel. Enter an ETH amount, click SWAP. Three transactions will fire in sequence — wrap ETH → approve WETH → swap WETH→USDG via the on-chain AMM pool. Confirm each MetaMask popup.',
          },
          {
            step: '03',
            title: 'Open a Position',
            body: 'Select any asset from Markets, go to Trade, choose LONG or SHORT, enter a USDG collateral amount, and click OPEN. The VIONATrader contract records your position on-chain and the price is locked from the oracle at open time.',
          },
          {
            step: '04',
            title: 'Monitor & Close',
            body: 'Open Portfolio to see live unrealised P&L. Click CLOSE next to any position to settle it. USDG is returned to your wallet, net of the 0.1 % protocol fee.',
          },
        ].map(s => (
          <div key={s.step} className="flex gap-4">
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'hsl(var(--primary) / 0.25)', fontFamily: 'var(--app-font-mono)', lineHeight: 1, flexShrink: 0, paddingTop: 2 }}>{s.step}</div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 4, color: 'hsl(var(--foreground))' }}>{s.title}</div>
              <p style={{ fontSize: '11px', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}>{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'trading',
    title: 'Trading',
    content: (
      <div className="space-y-4">
        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginBottom: 8 }}>HOW POSITIONS WORK</h3>
        <p>VIONA uses a Contract for Difference (CFD) model. You never hold a stock token — instead, the contract records your entry price, collateral, and direction. When you close, P&L is calculated from the oracle price delta and settled in USDG.</p>

        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '12px 16px', marginTop: 12 }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>P&L FORMULA</div>
          <code style={{ fontSize: '10px', color: 'hsl(var(--primary))', lineHeight: 2, display: 'block' }}>
            shares = collateral_usdg / entry_price<br />
            pnl = shares × (exit_price − entry_price)<br />
            long_pnl = +pnl &nbsp;&nbsp;|&nbsp;&nbsp; short_pnl = −pnl<br />
            returned = collateral + pnl − fee (0.1%)
          </code>
        </div>

        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginTop: 16, marginBottom: 8 }}>WALLET vs SHIELD FUNDING</h3>
        <p>Positions can be funded two ways:</p>
        <div className="space-y-2" style={{ marginTop: 8 }}>
          {[
            { mode: 'WALLET', desc: 'USDG is transferred directly from your wallet. Two MetaMask prompts: approve + open. Your on-chain address is visible in the Position event.' },
            { mode: 'SHIELD', desc: 'USDG is routed from the VIONA Shield pool via a ZK spend proof. One MetaMask prompt after the proof generates (~30–120 s). The source of funds is never on-chain-linkable to your wallet.' },
          ].map(m => (
            <div key={m.mode} style={{ display: 'flex', gap: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '10px 14px' }}>
              <span style={{ fontSize: '8px', letterSpacing: '0.14em', color: 'hsl(var(--primary))', minWidth: 50, paddingTop: 1 }}>{m.mode}</span>
              <span style={{ fontSize: '11px', lineHeight: 1.6, color: 'hsl(var(--muted-foreground))' }}>{m.desc}</span>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginTop: 16, marginBottom: 8 }}>PRICE ORACLE</h3>
        <p>Prices are pushed to VIONAPriceFeed on-chain every ~90 seconds by the VIONA price-updater service. Prices have 6-decimal precision ($1 = 1,000,000). The oracle is permissioned — only the designated updater can write prices. Positions use the price available at the block your transaction is confirmed.</p>

        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginTop: 16, marginBottom: 8 }}>FEES</h3>
        <p>A flat <strong>0.1% (10 bps)</strong> fee is deducted from collateral on position open. Gas is paid in ETH on Robinhood Chain; fees are minimal (typically &lt;$0.01).</p>
      </div>
    ),
  },
  {
    id: 'shield',
    title: 'VIONA Shield',
    content: (
      <div className="space-y-4">
        <p>
          VIONA Shield is a ZK shielded pool that lets you deposit USDG privately and trade without revealing your wallet's trading history.
          It uses <strong>UltraHonk proofs</strong> (Aztec Barretenberg backend) with a Poseidon2 Merkle tree for commitments.
        </p>

        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginTop: 12, marginBottom: 8 }}>HOW KEYS ARE DERIVED</h3>
        <p>No seed phrase or separate key is stored. When you visit the Shield page, VIONA asks MetaMask to sign two deterministic messages:</p>
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '12px 16px', marginTop: 8 }}>
          <code style={{ fontSize: '10px', color: 'hsl(var(--primary))', lineHeight: 2.2, display: 'block' }}>
            SPEND KEY: sign("VIONA Shield Spend Key v1")<br />
            VIEW KEY: &nbsp;sign("VIONA Shield View Key v1")<br />
            <br />
            sk &nbsp;= poseidon(keccak(sig_spend))<br />
            vpk = poseidon(keccak(sig_view)) &nbsp;&nbsp;← encryption only
          </code>
        </div>
        <p>Keys exist only in memory for the duration of your session. Closing the tab or disconnecting clears them entirely.</p>

        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginTop: 16, marginBottom: 8 }}>SHIELD FLOW (DEPOSIT)</h3>
        {[
          'Choose USDG amount and click SHIELD USDG.',
          'If first-time: MetaMask prompts USDG approve for the pool contract (unlimited, one-time).',
          'A Poseidon2 commitment is computed from your spending key + random blinding factor.',
          'Ciphertext (AES-GCM encrypted note) is prepared for your view key.',
          'A ZK proof is generated in a background Web Worker — no private data leaves the browser.',
          'The shield transaction is submitted: pool verifies the proof, inserts the commitment into the Merkle tree, and emits an encrypted note event.',
          'Click ↻ SYNC SHIELD on the Trade page to reflect the new balance.',
        ].map((s, i) => (
          <div key={i} className="flex gap-3" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: '9px', color: 'hsl(var(--primary))', fontFamily: 'var(--app-font-mono)', minWidth: 20, paddingTop: 1 }}>{i + 1}.</span>
            <span style={{ fontSize: '11px', lineHeight: 1.6, color: 'hsl(var(--muted-foreground))' }}>{s}</span>
          </div>
        ))}

        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginTop: 16, marginBottom: 8 }}>SPEND / TRADE FROM SHIELD</h3>
        <p>On the Trade page, toggle the funding mode to SHIELD and click OPEN POSITION (or use the SWAP tab). VIONA will:</p>
        {[
          'Derive your keys (two MetaMask signatures).',
          'Select unspent notes covering the required amount.',
          'Build a spend statement with your VIONATrader address as the public recipient.',
          'Generate a UltraHonk proof (~30–120 seconds in browser).',
          'Submit one transaction: the pool verifies the proof, nullifies spent notes, and atomically sends USDG to the trader contract which opens your position.',
        ].map((s, i) => (
          <div key={i} className="flex gap-3" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: '9px', color: 'hsl(var(--primary))', fontFamily: 'var(--app-font-mono)', minWidth: 20, paddingTop: 1 }}>{i + 1}.</span>
            <span style={{ fontSize: '11px', lineHeight: 1.6, color: 'hsl(var(--muted-foreground))' }}>{s}</span>
          </div>
        ))}

        <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginTop: 16, marginBottom: 8 }}>SYNCING YOUR BALANCE</h3>
        <p>Balance is stored locally (localStorage) and synced by scanning pool events. Click <strong>↻ SYNC SHIELD</strong> on the Trade or Portfolio page to pull the latest state from chain. The sync decrypts all NoteCommitted events using your view key — notes not belonging to you are discarded silently.</p>
      </div>
    ),
  },
  {
    id: 'assets',
    title: 'Supported Assets',
    content: (
      <div className="space-y-4">
        <p>VIONA supports 96 tokenized assets across equities, ETFs, and crypto. Prices are sourced from Robinhood market data and pushed on-chain every ~90 seconds during market hours.</p>
        <div className="grid grid-cols-2 gap-2" style={{ marginTop: 12 }}>
          {[
            { cat: 'Technology', assets: 'AAPL, MSFT, NVDA, GOOG, AMZN, META, INTC, AMD, TSMC, QCOM, AVGO, ORCL' },
            { cat: 'Finance', assets: 'JPM, BAC, GS, MS, V, MA, PYPL, SCHW, AXP, BLK, C' },
            { cat: 'EV & Clean Energy', assets: 'TSLA, RIVN, NIO, LCID, FSLR, ENPH, PLUG, BE, FLNC' },
            { cat: 'ETFs', assets: 'SPY, QQQ, IWM, GLD, SLV, XLF, XLE, ARKK, VNQ' },
            { cat: 'Crypto-adjacent', assets: 'COIN, MSTR, MARA, CLSK, RIOT, IREN, HUT' },
            { cat: 'Consumer & Other', assets: 'COST, SBUX, NKE, DIS, NFLX, SHOP, SNOW, DDOG, CRWD' },
          ].map(c => (
            <div key={c.cat} style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '10px 12px' }}>
              <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: 'hsl(var(--primary))', marginBottom: 5 }}>{c.cat.toUpperCase()}</div>
              <div style={{ fontSize: '10px', lineHeight: 1.6, color: 'hsl(var(--muted-foreground))' }}>{c.assets}</div>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 8, fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
          All assets are available for both LONG and SHORT positions regardless of market hours.
          P&L uses the latest oracle price at close time.
        </p>
      </div>
    ),
  },
  {
    id: 'contracts',
    title: 'Smart Contracts',
    content: (
      <div className="space-y-4">
        <p>All VIONA contracts are deployed on <strong>Robinhood Chain (Chain ID 4663)</strong>. Source code is written in Solidity; ZK circuits in Noir.</p>
        <div className="space-y-2" style={{ marginTop: 12 }}>
          {[
            {
              name: 'VIONATrader',
              addr: '0x65282D832CD1DEA2d50d8DD88852a5e73CAb94e7',
              desc: 'Core CFD engine. Manages positions, settles P&L, calls ShieldedPool for ZK-funded opens.',
            },
            {
              name: 'ShieldedPool',
              addr: '0xF6716fA1d5E58E1982a257d624571FB70b2B19Bf',
              desc: 'UltraHonk ZK shielded pool. Stores encrypted commitments in a depth-20 Poseidon2 Merkle tree.',
            },
            {
              name: 'VIONAPriceFeed',
              addr: '0xCB0Fc38a1310C03D7DE11279Fdf8b2332D5c9B36',
              desc: 'On-chain price oracle. Permissioned updater pushes 20 symbols every ~90 s.',
            },
            {
              name: 'USDG (Paxos)',
              addr: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
              desc: 'ERC-20 collateral token. 6-decimal precision. Bridged from Ethereum mainnet.',
            },
            {
              name: 'SwapRouter (Robinhood)',
              addr: '0xCaf681a66D6Cf36B30e2B06fBBDf40Bff4ee0A6',
              desc: 'Uniswap V3 SwapRouter02 deployed on Robinhood Chain. Used for ETH → USDG swaps.',
            },
          ].map(c => (
            <div key={c.name} style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '12px 14px' }}>
              <div className="flex items-baseline gap-3 flex-wrap" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'hsl(var(--foreground))' }}>{c.name}</span>
                <a
                  href={`https://robinhoodchain.blockscout.com/address/${c.addr}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '9px', fontFamily: 'var(--app-font-mono)', color: 'hsl(var(--primary))', letterSpacing: '0.04em', textDecoration: 'none' }}
                >
                  {c.addr.slice(0, 10)}…{c.addr.slice(-8)} ↗
                </a>
              </div>
              <p style={{ fontSize: '11px', lineHeight: 1.6, color: 'hsl(var(--muted-foreground))', margin: 0 }}>{c.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '12px 14px', marginTop: 8 }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'hsl(var(--primary))', marginBottom: 6 }}>ZK STACK</div>
          <div className="space-y-1">
            {[
              ['Proof system', 'UltraHonk (Aztec Barretenberg v0.82)'],
              ['Circuit language', 'Noir v1.0.0-beta.6'],
              ['Hash function', 'Poseidon2 (BN254 prime field)'],
              ['Commitment scheme', 'Pedersen-like, depth-20 Merkle tree'],
              ['Note encryption', 'AES-256-GCM with ECDH-derived key'],
              ['Proving environment', 'Browser Web Worker — single-threaded WASM'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <span style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', minWidth: 130 }}>{k}</span>
                <span style={{ fontSize: '10px', color: 'hsl(var(--foreground))', fontFamily: 'var(--app-font-mono)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'faq',
    title: 'FAQ',
    content: (
      <div className="space-y-4">
        {[
          {
            q: 'Which wallet do I need?',
            a: 'Any EIP-1193 browser wallet works — MetaMask is recommended. Mobile wallets via WalletConnect are supported.',
          },
          {
            q: 'How do I add Robinhood Chain to MetaMask?',
            a: 'VIONA will auto-prompt you to add and switch chains when you connect. Manually: Chain ID 4663, RPC https://rpc.mainnet.chain.robinhood.com, Currency ETH, Explorer https://robinhoodchain.blockscout.com.',
          },
          {
            q: 'How do I get ETH on Robinhood Chain?',
            a: 'Bridge ETH from Ethereum mainnet via the official Robinhood Chain bridge. You need a small amount for gas (~$0.01 worth covers many transactions).',
          },
          {
            q: 'How do I get USDG?',
            a: 'Use the GET USDG panel on the Trade page to swap ETH → USDG directly on-chain. Alternatively, bridge USDG from Ethereum mainnet.',
          },
          {
            q: 'Is there a minimum position size?',
            a: 'The minimum is 1 USDG. There is no maximum enforced by the contract, but large positions relative to oracle liquidity carry higher price-move risk.',
          },
          {
            q: 'Can my position be liquidated?',
            a: 'VIONA v1 has no liquidation mechanism. Positions remain open until you close them. If the market moves against you beyond your collateral, your return on close will be reduced but no forced liquidation occurs.',
          },
          {
            q: 'How private is VIONA Shield?',
            a: 'Shield deposits and spends are unlinkable on-chain. An observer sees a commitment inserted into a Merkle tree and later a nullifier spent — but cannot link the two, or connect either to your wallet address, without your spending key.',
          },
          {
            q: 'What happens if I close my browser during ZK proof generation?',
            a: 'The proof is lost and you will need to start again. The Shield deposit or trade is not submitted until after the proof completes and you sign the final transaction in MetaMask.',
          },
          {
            q: 'How long does ZK proof generation take?',
            a: 'Shield proofs (deposit) use a stub verifier and complete in ~2–5 seconds. Spend proofs (trade from Shield) run a full UltraHonk proof — expect 30–120 seconds depending on your device.',
          },
          {
            q: 'Are positions settled immediately?',
            a: 'Yes. Open and close are on-chain transactions confirmed on Robinhood Chain (typically 1–3 second finality). P&L is settled atomically at close.',
          },
        ].map(({ q, a }) => (
          <div key={q} style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: 14 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'hsl(var(--foreground))', marginBottom: 5, letterSpacing: '0.02em' }}>{q}</div>
            <p style={{ fontSize: '11px', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))', margin: 0 }}>{a}</p>
          </div>
        ))}
      </div>
    ),
  },
];

export function DocsPage() {
  const [active, setActive] = useState('overview');
  const section = SECTIONS.find(s => s.id === active) ?? SECTIONS[0];

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col md:flex-row overflow-hidden">

      {/* ── Desktop sidebar (hidden on mobile) ───────────────────── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0 border-r border-border overflow-y-auto"
        style={{ width: '180px', background: 'hsl(var(--card))' }}
      >
        <div style={{ fontSize: '8px', letterSpacing: '0.18em', color: 'hsl(var(--muted-foreground) / 0.4)', padding: '16px 16px 8px' }}>
          DOCUMENTATION
        </div>
        <nav className="flex flex-col flex-1">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 16px',
                fontSize: '10px',
                letterSpacing: '0.08em',
                fontFamily: 'var(--app-font-mono)',
                fontWeight: active === s.id ? 700 : 400,
                color: active === s.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                background: active === s.id ? 'hsl(var(--primary) / 0.06)' : 'transparent',
                borderLeft: active === s.id ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                cursor: 'pointer',
                transition: 'color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { if (s.id !== active) (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--foreground))'; }}
              onMouseLeave={e => { if (s.id !== active) (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--muted-foreground))'; }}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px', borderTop: '1px solid hsl(var(--border))' }}>
          <div style={{ fontSize: '7.5px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground) / 0.35)', lineHeight: 1.9 }}>
            VIONA LAYER v1<br />
            Robinhood Chain 4663<br />
            Capital Moves in Silence
          </div>
        </div>
      </aside>

      {/* ── Mobile section tabs (hidden on desktop) ──────────────── */}
      <div
        className="md:hidden flex-shrink-0 border-b border-border overflow-x-auto"
        style={{ background: 'hsl(var(--card))' }}
      >
        <div className="flex" style={{ minWidth: 'max-content' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                padding: '0 14px',
                height: '40px',
                fontSize: '8px',
                letterSpacing: '0.12em',
                fontFamily: 'var(--app-font-mono)',
                fontWeight: active === s.id ? 700 : 400,
                color: active === s.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                background: 'transparent',
                border: 'none',
                borderBottom: active === s.id ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.title.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 md:p-8" style={{ maxWidth: 760 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: '8px', letterSpacing: '0.16em', color: 'hsl(var(--muted-foreground) / 0.5)', marginBottom: 6, display: 'flex', gap: 6 }}>
          <Link href="/" style={{ color: 'hsl(var(--primary))', textDecoration: 'none' }}>VIONA</Link>
          <span>/</span>
          <span>DOCS</span>
          <span>/</span>
          <span>{section!.title.toUpperCase()}</span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.06em', color: 'hsl(var(--foreground))', marginBottom: 20, marginTop: 0 }}>
          {section!.title}
        </h1>

        {/* Body */}
        <div style={{ fontSize: '12px', lineHeight: 1.75, color: 'hsl(var(--muted-foreground))' }}>
          {section!.content}
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center" style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid hsl(var(--border))' }}>
          {(() => {
            const idx = SECTIONS.findIndex(s => s.id === active);
            const prev = SECTIONS[idx - 1];
            const next = SECTIONS[idx + 1];
            return (
              <>
                {prev ? (
                  <button onClick={() => setActive(prev.id)} style={{ fontSize: '9px', letterSpacing: '0.1em', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--app-font-mono)' }}>
                    ← {prev.title}
                  </button>
                ) : <span />}
                {next ? (
                  <button onClick={() => setActive(next.id)} style={{ fontSize: '9px', letterSpacing: '0.1em', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', fontFamily: 'var(--app-font-mono)' }}>
                    {next.title} →
                  </button>
                ) : <span />}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
