import React, { useState } from 'react';

/* ── Fallback sources (used when logoUrl prop is absent or fails) ─────────── */

// TradingView CDN slugs — fallback when Robinhood CDN logo fails
const TV_SLUG: Record<string, string> = {
  AAPL:  'apple',
  NVDA:  'nvidia',
  GOOGL: 'alphabet',
  MSFT:  'microsoft',
  TSLA:  'tesla',
  AMZN:  'amazon',
  META:  'meta-platforms',
  COIN:  'coinbase',
  COST:  'costco',
  NFLX:  'netflix',
  AMD:   'amd',
  INTC:  'intel',
  QCOM:  'qualcomm',
  ORCL:  'oracle',
  SHOP:  'shopify',
  BABA:  'alibaba',
  TSM:   'tsmc',
  AVGO:  'broadcom',
  SPY:   'fund/spdr-s-p-500-etf-trust',
  QQQ:   'fund/invesco-qqq-trust',
  SOXX:  'fund/ishares-semiconductor-etf',
  SGOV:  'fund/ishares-0-3-month-treasury-bond-etf',
};

// Clearbit domain fallback (last resort before letter avatar)
const CLEARBIT_DOMAIN: Record<string, string> = {
  AAPL:  'apple.com',
  NVDA:  'nvidia.com',
  GOOGL: 'google.com',
  MSFT:  'microsoft.com',
  TSLA:  'tesla.com',
  AMZN:  'amazon.com',
  META:  'meta.com',
  COIN:  'coinbase.com',
  COST:  'costco.com',
  NFLX:  'netflix.com',
  AMD:   'amd.com',
  INTC:  'intel.com',
  QCOM:  'qualcomm.com',
  ORCL:  'oracle.com',
  SHOP:  'shopify.com',
  SPY:   'ssga.com',
  QQQ:   'invesco.com',
  SOXX:  'blackrock.com',
  SGOV:  'blackrock.com',
};

function buildSources(symbol: string, logoUrl?: string | null): string[] {
  const urls: string[] = [];

  // 1️⃣ Official Robinhood CDN logo (from /assets API)
  if (logoUrl) urls.push(logoUrl);

  // 2️⃣ TradingView CDN
  const slug = TV_SLUG[symbol];
  if (slug) urls.push(`https://s3-symbol-logo.tradingview.com/${slug}--big.svg`);

  // 3️⃣ Financial Modeling Prep
  urls.push(`https://financialmodelingprep.com/image-stock/${symbol}.png`);

  // 4️⃣ Clearbit
  const domain = CLEARBIT_DOMAIN[symbol];
  if (domain) urls.push(`https://logo.clearbit.com/${domain}`);

  return urls;
}

interface AssetLogoProps {
  symbol: string;
  /** Official Robinhood CDN logo URL from market data (logoUrl field). */
  logoUrl?: string | null;
  size?: number;
}

export function AssetLogo({ symbol, logoUrl, size = 24 }: AssetLogoProps) {
  const sources = buildSources(symbol, logoUrl);
  const [idx, setIdx] = useState(0);

  // Reset index when sources change (symbol or logoUrl changed)
  const sourceKey = sources[0] ?? symbol;

  const failed = idx >= sources.length;

  if (failed || sources.length === 0) {
    return (
      <div
        style={{
          width: size, height: size, flexShrink: 0,
          background: 'hsl(var(--primary) / 0.12)',
          border: '1px solid hsl(var(--primary) / 0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.max(7, size * 0.34) + 'px',
          fontWeight: 700, color: 'hsl(var(--primary))',
          borderRadius: '2px',
        }}
      >
        {symbol.replace('-', '').slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      key={sourceKey + idx}
      src={sources[idx]}
      alt={symbol}
      onError={() => setIdx(i => i + 1)}
      style={{
        width: size, height: size, flexShrink: 0,
        objectFit: 'contain',
        borderRadius: '3px',
        background: 'hsl(var(--primary) / 0.10)',
        padding: '2px',
      }}
    />
  );
}
