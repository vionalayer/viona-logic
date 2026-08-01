/**
 * useOnChainBalances — shared hook for real on-chain ETH + USDG balances.
 * Used across Dashboard, Portfolio, Trade, and Wallet pages.
 * No paper-trading DB involved — all data comes from on-chain RPC calls.
 */
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { useState, useEffect } from 'react';
import { USDG_ADDRESS, ERC20_ABI } from '@/lib/wagmi';
import { getEthBalance } from '@/lib/shield/pool';
import { getEthPrice } from '@/lib/shield/market';
import type { Address } from 'viem';

export interface OnChainBalances {
  ethBalance: bigint;       // wei
  usdgBalance: bigint;      // 6-decimal USDG units
  ethPrice: number | null;  // USD / ETH
  ethUsd: number;           // ETH value in USD
  usdgUsd: number;          // USDG value in USD
  totalUsd: number;         // combined
  isConnected: boolean;
  isLoading: boolean;
  address: Address | undefined;
  chainId: number;
  isRobinhoodChain: boolean;
}

export function useOnChainBalances(): OnChainBalances {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isRobinhoodChain = chainId === 4663;

  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const usdgAddr = USDG_ADDRESS[chainId];
  const { data: usdgRaw, isLoading: usdgLoading } = useReadContract(
    usdgAddr && address
      ? { address: usdgAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }
      : (undefined as any),
  );

  // Refresh ETH balance when address/chain changes
  useEffect(() => {
    if (!address || !isRobinhoodChain) { setEthBalance(0n); return; }
    setBalanceLoading(true);
    getEthBalance(address as Address)
      .then(setEthBalance)
      .catch(() => setEthBalance(0n))
      .finally(() => setBalanceLoading(false));
  }, [address, isRobinhoodChain]);

  // ETH/USD price (once on mount)
  useEffect(() => {
    getEthPrice().then(setEthPrice).catch(() => {});
  }, []);

  const usdgBalance = (usdgRaw as bigint | undefined) ?? 0n;
  const ethUsd      = ethPrice ? (Number(ethBalance) / 1e18) * ethPrice : 0;
  const usdgUsd     = Number(usdgBalance) / 1e6;
  const totalUsd    = ethUsd + usdgUsd;

  return {
    ethBalance,
    usdgBalance,
    ethPrice,
    ethUsd,
    usdgUsd,
    totalUsd,
    isConnected,
    isLoading: balanceLoading || usdgLoading,
    address: address as Address | undefined,
    chainId,
    isRobinhoodChain,
  };
}
