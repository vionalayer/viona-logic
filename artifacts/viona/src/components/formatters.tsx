import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function AnimatedNumber({ 
  value, 
  formatter = (v: number) => v.toString(),
  className,
  isPercent = false
}: { 
  value: number; 
  formatter?: (v: number) => string;
  className?: string;
  isPercent?: boolean;
}) {
  const [flashClass, setFlashClass] = useState('');
  const prevValue = useRef(value);

  useEffect(() => {
    if (value > prevValue.current) {
      setFlashClass('flash-green');
      const timer = setTimeout(() => setFlashClass(''), 1000);
      prevValue.current = value;
      return () => clearTimeout(timer);
    } else if (value < prevValue.current) {
      setFlashClass('flash-red');
      const timer = setTimeout(() => setFlashClass(''), 1000);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [value]);

  return (
    <span className={cn('transition-colors duration-200', flashClass, className)}>
      {formatter(value)}
    </span>
  );
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(value / 100); // IntL percent multiplies by 100, assuming value is already percentage like 1.5 for 1.5%
  // Wait, if API returns 1.5 for 1.5%, we should divide by 100.
  return formatted;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toString();
}

export function ValueDisplay({
  value,
  type = 'currency',
  className,
}: {
  value: number | null | undefined;
  type?: 'currency' | 'percent' | 'number' | 'volume';
  className?: string;
}) {
  if (value === null || value === undefined) {
    return <span className={cn("font-mono-tabular text-muted-foreground", className)}>—</span>;
  }

  let colorClass = '';
  if (type === 'percent' || type === 'currency') {
    // We only color percents normally, but sometimes currency if it's PnL. 
    // Usually PnL is accompanied by percent. Let's color only if requested, or based on value.
  }

  let formatted = '';
  if (type === 'currency') formatted = formatCurrency(value);
  if (type === 'percent') formatted = formatPercent(value);
  if (type === 'number') formatted = formatNumber(value);
  if (type === 'volume') formatted = formatVolume(value);

  return (
    <AnimatedNumber 
      value={value} 
      formatter={() => formatted} 
      className={cn("font-mono-tabular tracking-tight", className)} 
    />
  );
}
