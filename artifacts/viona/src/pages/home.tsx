import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import {
  TrendingUp, BarChart3, Landmark, CreditCard, Building2, Globe,
  User, Briefcase, Zap, Bot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ── Animated counter ─────────────────────────────────────────── */
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = Date.now();
      const dur = 1400;
      const tick = () => {
        const p = Math.min((Date.now() - start) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(ease * to));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ── Fade-in on scroll ────────────────────────────────────────── */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Divider ──────────────────────────────────────────────────── */
const HR = () => (
  <div style={{ width: '40px', height: '1px', background: 'hsl(var(--primary) / 0.4)', margin: '0 auto' }} />
);

/* ── Section wrapper ──────────────────────────────────────────── */
function Section({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <section
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '72px 24px',
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </section>
  );
}

export function HomePage() {
  return (
    <div
      className="animate-in fade-in duration-500"
      style={{ overflowX: 'hidden', color: 'hsl(var(--foreground))' }}
    >

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle grid background */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: `
              linear-gradient(hsl(var(--primary) / 0.04) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--primary) / 0.04) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Logo as hero background */}
        <img
          aria-hidden
          src="/viona-logo.jpg"
          alt=""
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -52%)',
            width: 'clamp(480px, 78vw, 900px)',
            height: 'clamp(480px, 78vw, 900px)',
            objectFit: 'cover',
            opacity: 0.06,
            filter: 'blur(0.5px) grayscale(100%)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />

        {/* Radial fade — vignette over the logo */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 2,
            background: `
              radial-gradient(ellipse 70% 60% at 50% 50%, transparent 20%, hsl(var(--background)) 78%),
              linear-gradient(to bottom, hsl(var(--background)) 0%, transparent 18%, transparent 82%, hsl(var(--background)) 100%)
            `,
          }}
        />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 680 }}>
          {/* Eyebrow */}
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              border: '1px solid hsl(var(--primary) / 0.3)',
              background: 'hsl(var(--primary) / 0.06)',
              padding: '5px 14px', marginBottom: 32,
              fontSize: '9px', letterSpacing: '0.2em', fontFamily: 'var(--app-font-mono)',
              color: 'hsl(var(--primary))',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'hsl(var(--primary))', boxShadow: '0 0 6px hsl(var(--primary))', flexShrink: 0 }} />
            LIVE ON ROBINHOOD CHAIN — CHAIN ID 4663
          </div>

          {/* Headline */}
          <h1
            style={{
              fontSize: 'clamp(32px, 6vw, 64px)',
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              marginBottom: 24,
              color: 'hsl(var(--foreground))',
            }}
          >
            Capital Moves<br />
            <span style={{ color: 'hsl(var(--primary))' }}>in Silence.</span>
          </h1>

          {/* Subheadline */}
          <p
            style={{
              fontSize: 'clamp(14px, 2vw, 18px)',
              lineHeight: 1.65,
              color: 'hsl(var(--muted-foreground))',
              maxWidth: 520,
              margin: '0 auto 40px',
            }}
          >
            The confidential execution layer for tokenized stocks, ETFs, and real-world assets on Robinhood Chain.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/trade">
              <button
                type="button"
                style={{
                  height: 44, padding: '0 28px',
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--background))',
                  border: 'none', cursor: 'pointer',
                  fontSize: '10px', letterSpacing: '0.16em', fontWeight: 700,
                  fontFamily: 'var(--app-font-mono)',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                START TRADING →
              </button>
            </Link>
            <Link href="/docs">
              <button
                type="button"
                style={{
                  height: 44, padding: '0 28px',
                  background: 'transparent',
                  color: 'hsl(var(--foreground))',
                  border: '1px solid hsl(var(--border))', cursor: 'pointer',
                  fontSize: '10px', letterSpacing: '0.16em', fontWeight: 600,
                  fontFamily: 'var(--app-font-mono)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.6)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'hsl(var(--border))')}
              >
                READ DOCS
              </button>
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div
          style={{
            position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            color: 'hsl(var(--muted-foreground) / 0.35)', fontSize: '8px', letterSpacing: '0.14em',
            fontFamily: 'var(--app-font-mono)',
          }}
        >
          SCROLL
          <div style={{ width: 1, height: 32, background: 'hsl(var(--muted-foreground) / 0.2)' }} />
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────── */}
      <Reveal>
        <div
          style={{
            borderTop: '1px solid hsl(var(--border))',
            borderBottom: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
          }}
        >
          <div
            style={{
              maxWidth: 760, margin: '0 auto',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 0,
            }}
          >
            {[
              { label: 'TOKENIZED ASSETS', value: 96, suffix: '' },
              { label: 'CHAIN ID', value: 4663, suffix: '' },
              { label: 'ORACLE UPDATE', value: 90, suffix: 's' },
              { label: 'PROTOCOL FEE', value: 0.1, suffix: '%' },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  padding: '28px 24px',
                  borderRight: i < 3 ? '1px solid hsl(var(--border))' : 'none',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 'clamp(22px, 4vw, 32px)',
                    fontWeight: 700,
                    fontFamily: 'var(--app-font-mono)',
                    color: 'hsl(var(--primary))',
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {typeof s.value === 'number' && Number.isInteger(s.value)
                    ? <Counter to={s.value} suffix={s.suffix} />
                    : <>{s.value}{s.suffix}</>}
                </div>
                <div style={{ fontSize: '8px', letterSpacing: '0.14em', color: 'hsl(var(--muted-foreground) / 0.5)' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── PROBLEM ─────────────────────────────────────────────── */}
      <Section center>
        <Reveal>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'hsl(var(--primary))', marginBottom: 20 }}>
            THE PROBLEM
          </div>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 24, letterSpacing: '-0.01em' }}>
            Robinhood is putting<br />Wall Street onchain.
          </h2>
          <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'hsl(var(--muted-foreground))', marginBottom: 36, maxWidth: 560, margin: '0 auto 36px' }}>
            Stocks. ETFs. Treasuries. Real-world assets. The next generation of financial markets won't live behind brokerage accounts — they'll live onchain.
          </p>
          <HR />
          <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'hsl(var(--muted-foreground))', marginTop: 36, maxWidth: 560, margin: '36px auto 0' }}>
            But one problem remains.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 48 }}>
            {[
              'Every trade becomes public.',
              'Every position becomes a signal.',
              'Every strategy becomes someone else\'s opportunity.',
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  padding: '20px 28px',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  fontSize: '15px',
                  fontWeight: 500,
                  color: 'hsl(var(--foreground) / 0.7)',
                  letterSpacing: '0.01em',
                  lineHeight: 1,
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={200}>
          <p style={{ fontSize: '20px', fontWeight: 700, marginTop: 48, color: 'hsl(var(--foreground))' }}>
            Capital deserves better.
          </p>
        </Reveal>
      </Section>

      {/* ── WHY VIONA ───────────────────────────────────────────── */}
      <div style={{ background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--border))', borderBottom: '1px solid hsl(var(--border))' }}>
        <Section>
          <Reveal>
            <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'hsl(var(--primary))', marginBottom: 16 }}>
              WHY VIONA EXISTS
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 24, letterSpacing: '-0.01em' }}>
              Traditional markets<br />protect execution.
            </h2>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 40 }}>
            {[
              {
                label: 'THE OLD WAY',
                body: 'Large institutions don\'t reveal billion-dollar orders before they\'re filled. Execution happens behind closed doors. Strategy stays private.',
                dim: true,
              },
              {
                label: 'ONCHAIN TODAY',
                body: 'Public blockchains expose every trading intention before execution. Your order is visible the moment it\'s broadcast. That\'s the gap VIONA solves.',
                dim: true,
              },
              {
                label: 'WITH VIONA',
                body: 'VIONA is the execution layer designed for tokenized stocks and real-world assets. Not to hide the blockchain — but to protect how capital moves.',
                dim: false,
              },
            ].map(c => (
              <Reveal key={c.label}>
                <div
                  style={{
                    padding: '24px',
                    border: `1px solid ${c.dim ? 'hsl(var(--border))' : 'hsl(var(--primary) / 0.4)'}`,
                    background: c.dim ? 'transparent' : 'hsl(var(--primary) / 0.04)',
                    height: '100%',
                  }}
                >
                  <div style={{ fontSize: '8px', letterSpacing: '0.16em', color: c.dim ? 'hsl(var(--muted-foreground) / 0.5)' : 'hsl(var(--primary))', marginBottom: 12 }}>
                    {c.label}
                  </div>
                  <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                    {c.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      </div>

      {/* ── ASSET CLASSES ───────────────────────────────────────── */}
      <Section center>
        <Reveal>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'hsl(var(--primary))', marginBottom: 16 }}>
            BUILT FOR THE NEXT FINANCIAL SYSTEM
          </div>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 16, letterSpacing: '-0.01em' }}>
            The future isn't more memecoins.
          </h2>
          <p style={{ fontSize: '15px', color: 'hsl(var(--muted-foreground))', marginBottom: 48, lineHeight: 1.7, maxWidth: 500, margin: '0 auto 48px' }}>
            As trillions of dollars move onchain, execution quality becomes infrastructure — not a luxury.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 12,
            }}
          >
            {([
              { Icon: TrendingUp,  label: 'Tokenized Stocks', sub: '96 assets live',    live: true  },
              { Icon: BarChart3,   label: 'ETFs',             sub: 'Index & sector',    live: true  },
              { Icon: Landmark,    label: 'Treasuries',       sub: 'US T-bills & bonds',live: true  },
              { Icon: CreditCard,  label: 'Private Credit',   sub: 'Coming soon',       live: false },
              { Icon: Building2,   label: 'Real Estate',      sub: 'Coming soon',       live: false },
              { Icon: Globe,       label: 'Global RWAs',      sub: 'Coming soon',       live: false },
            ] as { Icon: LucideIcon; label: string; sub: string; live: boolean }[]).map(a => (
              <div
                key={a.label}
                style={{
                  padding: '22px 16px',
                  border: `1px solid ${a.live ? 'hsl(var(--primary) / 0.25)' : 'hsl(var(--border))'}`,
                  background: a.live ? 'hsl(var(--primary) / 0.03)' : 'hsl(var(--card))',
                  textAlign: 'center',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <a.Icon
                    style={{
                      width: 22, height: 22,
                      color: a.live ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.35)',
                      strokeWidth: 1.5,
                    }}
                  />
                </div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: a.live ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.5)', marginBottom: 4 }}>{a.label}</div>
                <div style={{ fontSize: '8px', color: a.live ? 'hsl(var(--primary) / 0.6)' : 'hsl(var(--muted-foreground) / 0.3)', letterSpacing: '0.1em' }}>{a.sub.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── WHAT VIONA DELIVERS ─────────────────────────────────── */}
      <div style={{ background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--border))', borderBottom: '1px solid hsl(var(--border))' }}>
        <Section>
          <Reveal>
            <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'hsl(var(--primary))', marginBottom: 16 }}>
              WHAT VIONA DELIVERS
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 12, letterSpacing: '-0.01em' }}>
              Execute with discretion.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))', marginBottom: 40, maxWidth: 500 }}>
              Instead of exposing every trading intention before execution, VIONA helps traders execute with confidentiality. Because your strategy is yours — not the market's.
            </p>
          </Reveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              {
                num: '01',
                title: 'Less information leakage.',
                body: 'ZK-shielded positions mean observers cannot front-run your strategy. Your entry, size, and direction remain private until you choose to reveal them.',
              },
              {
                num: '02',
                title: 'Less unnecessary market impact.',
                body: 'When your orders don\'t telegraph intent, price discovery reflects genuine supply and demand — not pre-positioning against your trade.',
              },
              {
                num: '03',
                title: 'More control over execution.',
                body: 'UltraHonk ZK proofs, Poseidon2 Merkle commitments, and on-chain settlement. Institutional-grade privacy on a public chain.',
              },
            ].map(item => (
              <Reveal key={item.num}>
                <div
                  style={{
                    display: 'flex', gap: 24, alignItems: 'flex-start',
                    padding: '24px 0',
                    borderBottom: '1px solid hsl(var(--border))',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px', fontFamily: 'var(--app-font-mono)',
                      color: 'hsl(var(--primary) / 0.4)', fontWeight: 700,
                      flexShrink: 0, paddingTop: 2, minWidth: 24,
                    }}
                  >
                    {item.num}
                  </span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: 6, color: 'hsl(var(--foreground))' }}>
                      {item.title}
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                      {item.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      </div>

      {/* ── WHO IT'S FOR ────────────────────────────────────────── */}
      <Section center>
        <Reveal>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'hsl(var(--primary))', marginBottom: 16 }}>
            BUILT FOR SERIOUS TRADERS
          </div>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 700, lineHeight: 1.2, marginBottom: 12, letterSpacing: '-0.01em' }}>
            If you're managing real capital,<br />execution matters.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12, marginTop: 40,
            }}
          >
            {([
              { Icon: User,      label: 'Retail Traders',  desc: 'Trade stocks on-chain without broadcasting your strategy' },
              { Icon: Briefcase, label: 'Funds',           desc: 'Block-size execution without front-running exposure' },
              { Icon: Zap,       label: 'Market Makers',   desc: 'Tighter spreads when your book stays confidential' },
              { Icon: Bot,       label: 'AI Agents',       desc: 'Autonomous trading with ZK-proven execution' },
            ] as { Icon: LucideIcon; label: string; desc: string }[]).map(u => (
              <div
                key={u.label}
                style={{
                  padding: '28px 20px',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, marginBottom: 14,
                    border: '1px solid hsl(var(--primary) / 0.25)',
                    background: 'hsl(var(--primary) / 0.06)',
                  }}
                >
                  <u.Icon style={{ width: 18, height: 18, color: 'hsl(var(--primary))', strokeWidth: 1.5 }} />
                </div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: 'hsl(var(--foreground))', marginBottom: 8 }}>{u.label}</div>
                <p style={{ fontSize: '11px', lineHeight: 1.6, color: 'hsl(var(--muted-foreground))', margin: 0 }}>{u.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── VISION ──────────────────────────────────────────────── */}
      <div style={{ background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--border))', borderBottom: '1px solid hsl(var(--border))' }}>
        <Section center>
          <Reveal>
            <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'hsl(var(--primary))', marginBottom: 20 }}>
              VISION
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 24 }}>
              Robinhood is bringing<br />capital markets onchain.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'hsl(var(--muted-foreground))', maxWidth: 520, margin: '0 auto 20px' }}>
              VIONA is building the execution layer they'll need.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, margin: '0 auto', textAlign: 'left' }}>
              {[
                'Not another DEX.',
                'Not another privacy protocol.',
                'A new standard for how tokenized capital moves.',
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: i === 2 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)', fontSize: '12px' }}>
                    {i === 2 ? '→' : '—'}
                  </span>
                  <span style={{
                    fontSize: '14px',
                    color: i === 2 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.45)',
                    fontWeight: i === 2 ? 600 : 400,
                  }}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>
      </div>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <Section center>
        <Reveal>
          <div
            style={{
              padding: '60px 40px',
              border: '1px solid hsl(var(--primary) / 0.2)',
              background: 'hsl(var(--primary) / 0.03)',
              maxWidth: 600,
              margin: '0 auto',
            }}
          >
            <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'hsl(var(--primary))', marginBottom: 20 }}>
              EXECUTION WITHOUT EXPOSURE
            </div>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 16 }}>
              Trade Stocks.<br />Keep the Strategy Yours.
            </h2>
            <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))', marginBottom: 36, maxWidth: 420, margin: '0 auto 36px' }}>
              Connect your wallet, get USDG, and start trading tokenized stocks with confidential execution on Robinhood Chain.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/trade">
                <button
                  type="button"
                  style={{
                    height: 48, padding: '0 32px',
                    background: 'hsl(var(--primary))',
                    color: 'hsl(var(--background))',
                    border: 'none', cursor: 'pointer',
                    fontSize: '10px', letterSpacing: '0.16em', fontWeight: 700,
                    fontFamily: 'var(--app-font-mono)',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  OPEN TERMINAL →
                </button>
              </Link>
              <Link href="/shield">
                <button
                  type="button"
                  style={{
                    height: 48, padding: '0 32px',
                    background: 'transparent',
                    color: 'hsl(var(--primary))',
                    border: '1px solid hsl(var(--primary) / 0.4)', cursor: 'pointer',
                    fontSize: '10px', letterSpacing: '0.16em', fontWeight: 600,
                    fontFamily: 'var(--app-font-mono)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.8)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.4)')}
                >
                  EXPLORE SHIELD
                </button>
              </Link>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid hsl(var(--border))',
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
          <img src="/viona-logo.jpg" alt="VIONA" style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: '2px' }} />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em' }}>VIONA</span>
          <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.22em', color: 'hsl(var(--primary))' }}>LAYER</span>
        </div>
        <p style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground) / 0.35)', margin: 0 }}>
          CAPITAL MOVES IN SILENCE &nbsp;·&nbsp; ROBINHOOD CHAIN 4663 &nbsp;·&nbsp; CONFIDENTIAL EXECUTION LAYER
        </p>
      </footer>
    </div>
  );
}
