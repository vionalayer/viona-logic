import { useState, useEffect, useCallback } from 'react';

export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'FILLED' | 'FAILED';

export interface Order {
  id: string;
  symbol: string;
  name: string;
  side: OrderSide;
  usdgAmount: number;   // USDG spent (buy) or received (sell)
  shares: number;
  priceAtFill: number;
  fee: number;
  status: OrderStatus;
  txHash: string;
  timestamp: number;
}

const STORAGE_KEY = 'viona_orders_v1';

function loadOrders(): Order[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveOrders(orders: Order[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function fakeTxHash(): string {
  const hex = '0123456789abcdef';
  return '0x' + Array.from({ length: 64 }, () => hex[Math.floor(Math.random() * 16)]).join('');
}

function fakeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(loadOrders);

  // sync across tabs
  useEffect(() => {
    const handler = () => setOrders(loadOrders());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const placeOrder = useCallback(async (params: {
    symbol: string;
    name: string;
    side: OrderSide;
    usdgAmount: number;
    shares: number;
    priceAtFill: number;
  }): Promise<Order> => {
    // Simulate network latency (800-2000ms)
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

    const fee = parseFloat((params.usdgAmount * 0.001).toFixed(4)); // 0.1% fee

    const order: Order = {
      id: fakeId(),
      symbol: params.symbol,
      name: params.name,
      side: params.side,
      usdgAmount: params.usdgAmount,
      shares: params.shares,
      priceAtFill: params.priceAtFill,
      fee,
      status: 'FILLED',
      txHash: fakeTxHash(),
      timestamp: Date.now(),
    };

    setOrders(prev => {
      const next = [order, ...prev].slice(0, 100); // keep last 100
      saveOrders(next);
      return next;
    });

    return order;
  }, []);

  const clearOrders = useCallback(() => {
    setOrders([]);
    saveOrders([]);
  }, []);

  return { orders, placeOrder, clearOrders };
}
