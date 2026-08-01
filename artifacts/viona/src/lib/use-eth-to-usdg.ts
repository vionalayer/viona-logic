/**
 * useEthToUsdg — swap ETH → USDG via Uniswap V3 on Robinhood Chain.
 *
 * Flow:
 *   1. WETH.deposit(value=amountIn)          — wrap ETH to WETH
 *   2. WETH.approve(router, amountIn)        — only if allowance insufficient
 *   3. SwapRouter.exactInputSingle(...)      — swap WETH → USDG (no ETH value)
 *
 * Why not send ETH directly to SwapRouter?
 *   The router's internal WETH9 address may differ from our WETH contract,
 *   causing the auto-wrap path to revert during MetaMask simulation.
 *
 * Pool: WETH/USDG fee-500 (0x69bfaf19c9f377bb306a89aed9f6b07e2c1a8d9a)
 * Quote: computed off-chain from pool slot0 sqrtPriceX96
 */

import { useState, useCallback, useRef } from 'react';
import { parseAbi, parseEther, maxUint256 } from 'viem';
import { useAccount } from 'wagmi';
import { CONTRACTS, publicClient, walletClient, robinhoodChain } from './shield/contract';

/* ── Pool & swap constants ────────────────────────────────────────── */
const POOL_FEE = 500;
const POOL_ADDRESS = '0x69bfaf19c9f377bb306a89aed9f6b07e2c1a8d9a' as const;
const SLIPPAGE = 0.995;   // 0.5% slippage tolerance
const Q96 = 2n ** 96n;

/* ── ABIs ─────────────────────────────────────────────────────────── */
const POOL_ABI = parseAbi([
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
]);

const WETH_ABI = parseAbi([
  'function deposit() external payable',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

const ROUTER_ABI = parseAbi([
  // Robinhood Chain SwapRouter02 — NO deadline inside struct (differs from V1)
  // Confirmed via simulateContract: V2 struct succeeds, V1 struct reverts.
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
]);

/* ── Off-chain price from sqrtPriceX96 ───────────────────────────── */
// token0=WETH (18 dec), token1=USDG (6 dec)  →  price = USDG per 1 WETH
// price_raw = (sqrtP/2^96)^2  (in USDG_wei / WETH_wei units)
// human price = raw × 10^(18-6) = raw × 10^12
function ethPriceFromSqrt(sqrtPriceX96: bigint): number {
  const num = sqrtPriceX96 * sqrtPriceX96;   // sqrtP^2  (bigint)
  const den = Q96 * Q96;                      // 2^192
  // multiply by 1e18 for precision, then divide out at end
  const scaled = (num * 10n ** 18n) / den;
  return Number(scaled) / 1e18 * 1e12;       // × 10^12 for decimal adjustment
}

export type SwapStep =
  | 'idle'
  | 'quoting'
  | 'wrapping'    // WETH.deposit tx
  | 'approving'   // WETH.approve tx (if needed)
  | 'confirming'  // SwapRouter.exactInputSingle tx
  | 'mining'
  | 'done'
  | 'error';

export interface EthToUsdgState {
  step: SwapStep;
  estimatedUsdg: number | null;
  ethPrice: number | null;
  quoting: boolean;
  txHash: string | null;
  error: string;
  swap: (ethAmount: string) => Promise<void>;
  quote: (ethAmount: string) => Promise<number | null>;
  reset: () => void;
}

export function useEthToUsdg(): EthToUsdgState {
  const { address } = useAccount();
  const [step, setStep] = useState<SwapStep>('idle');
  const [estimatedUsdg, setEstimatedUsdg] = useState<number | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState('');

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Fetch ETH price from pool slot0, return estimated USDG for given ETH amount */
  const quote = useCallback(async (ethAmount: string): Promise<number | null> => {
    const eth = parseFloat(ethAmount);
    if (!eth || eth <= 0) { setEstimatedUsdg(null); return null; }

    if (quoteTimer.current) clearTimeout(quoteTimer.current);

    return new Promise(resolve => {
      quoteTimer.current = setTimeout(async () => {
        setQuoting(true);
        try {
          const client = publicClient();
          const [sqrtPriceX96] = await client.readContract({
            address: POOL_ADDRESS,
            abi: POOL_ABI,
            functionName: 'slot0',
          }) as [bigint, ...unknown[]];

          if (sqrtPriceX96 === 0n) { setEstimatedUsdg(null); resolve(null); return; }

          const price = ethPriceFromSqrt(sqrtPriceX96);
          const usdgOut = eth * price;
          setEthPrice(price);
          setEstimatedUsdg(usdgOut);
          resolve(usdgOut);
        } catch {
          setEstimatedUsdg(null);
          resolve(null);
        } finally {
          setQuoting(false);
        }
      }, 400);
    });
  }, []);

  const swap = useCallback(async (ethAmount: string): Promise<void> => {
    if (!address) { setError('Wallet not connected'); return; }
    const eth = parseFloat(ethAmount);
    if (!eth || eth <= 0) { setError('Enter ETH amount'); return; }

    setError('');
    setStep('quoting');

    try {
      const client = publicClient();
      const wc = walletClient();

      /* ── 1. Get fresh quote ─────────────────────────────────── */
      const [sqrtPriceX96] = await client.readContract({
        address: POOL_ADDRESS,
        abi: POOL_ABI,
        functionName: 'slot0',
      }) as [bigint, ...unknown[]];

      if (sqrtPriceX96 === 0n) throw new Error('Pool not initialized');

      const price = ethPriceFromSqrt(sqrtPriceX96);
      const amountIn = parseEther(ethAmount);
      const expectedUsdg = eth * price;
      // minOut in USDG 6-decimal units
      // amountOutMinimum=0 while diagnosing pool liquidity;
      // will tighten once swap is confirmed working
      const minOut = 0n;

      /* ── helper: get next nonce from the node (not MetaMask cache) ── */
      const pendingNonce = () =>
        client.getTransactionCount({ address: address!, blockTag: 'pending' });

      /* ── 2. Wrap ETH → WETH ─────────────────────────────────── */
      setStep('wrapping');
      const wrapHash = await wc.writeContract({
        address: CONTRACTS.weth,
        abi: WETH_ABI,
        functionName: 'deposit',
        account: address,
        chain: robinhoodChain,
        nonce: await pendingNonce(),
        value: amountIn,
        args: [],
      });
      await client.waitForTransactionReceipt({ hash: wrapHash });

      /* ── 3. Approve WETH for router if needed ───────────────── */
      const allowance = await client.readContract({
        address: CONTRACTS.weth,
        abi: WETH_ABI,
        functionName: 'allowance',
        args: [address, CONTRACTS.swapRouter],
      }) as bigint;

      if (allowance < amountIn) {
        setStep('approving');
        const approveHash = await wc.writeContract({
          address: CONTRACTS.weth,
          abi: WETH_ABI,
          functionName: 'approve',
          account: address,
          chain: robinhoodChain,
          nonce: await pendingNonce(),   // re-fetch — MetaMask cache may be stale
          args: [CONTRACTS.swapRouter, maxUint256],
        });
        await client.waitForTransactionReceipt({ hash: approveHash });
      }

      /* ── 4. Swap WETH → USDG ────────────────────────────────── */
      setStep('confirming');
      const swapHash = await wc.writeContract({
        address: CONTRACTS.swapRouter,
        abi: ROUTER_ABI,
        functionName: 'exactInputSingle',
        account: address,
        chain: robinhoodChain,
        nonce: await pendingNonce(),   // re-fetch after approve
        args: [{
          tokenIn: CONTRACTS.weth,
          tokenOut: CONTRACTS.usdg,
          fee: POOL_FEE,
          recipient: address,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        }],
        // no `value` — WETH already wrapped and approved
      });

      setStep('mining');
      await client.waitForTransactionReceipt({ hash: swapHash });

      setTxHash(swapHash);
      setEstimatedUsdg(expectedUsdg);
      setStep('done');
    } catch (e: any) {
      const msg: string = e?.shortMessage ?? e?.message ?? 'Swap failed';
      if (!msg.toLowerCase().includes('rejected') && !msg.toLowerCase().includes('denied')) {
        setError(msg);
      }
      setStep('error');
    }
  }, [address]);

  const reset = useCallback(() => {
    setStep('idle');
    setEstimatedUsdg(null);
    setEthPrice(null);
    setTxHash(null);
    setError('');
    setQuoting(false);
  }, []);

  return { step, estimatedUsdg, ethPrice, quoting, txHash, error, swap, quote, reset };
}
