import { createConfig, http } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { defineChain } from 'viem';
import { injected, coinbaseWallet } from 'wagmi/connectors';

/** Robinhood Chain Mainnet — https://docs.robinhood.com/chain/add-network-to-wallet/ */
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com/'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
  testnet: false,
});

export const wagmiConfig = createConfig({
  chains: [robinhoodChain, base, mainnet],
  connectors: [
    injected({ target: 'metaMask' }),
    injected(), // any injected (Rabby, Brave, etc.)
    coinbaseWallet({ appName: 'VIONA Layer' }),
  ],
  transports: {
    [robinhoodChain.id]: http('https://rpc.mainnet.chain.robinhood.com/'),
    [base.id]: http(),
    [mainnet.id]: http(),
  },
});

/** USDG (Global Dollar by Paxos) contract addresses per chain.
 *  Source: docs.paxos.com/guides/stablecoin/usdg/mainnet + robinhoodchain.blockscout.com */
export const USDG_ADDRESS: Record<number, `0x${string}`> = {
  [robinhoodChain.id]: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', // Robinhood Chain mainnet
  [base.id]:           '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base (USDC bridged)
  [mainnet.id]:        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum mainnet
};

/** Minimal ERC-20 ABI for reading balance + decimals */
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

/** Build the canonical order message for EIP-191 signing */
export function buildOrderMessage(params: {
  symbol: string;
  side: string;
  orderType: string;
  quantity: number;
  limitPrice?: number | null;
  timestamp: number;
}): string {
  const lines = [
    'VIONA LAYER — Order Authorization',
    `Action:    ${params.side}`,
    `Asset:     ${params.symbol}`,
    `Quantity:  ${params.quantity}`,
    `Type:      ${params.orderType}`,
    params.limitPrice != null ? `Limit:     $${params.limitPrice}` : null,
    `Timestamp: ${params.timestamp}`,
    '',
    'I authorize this trade on VIONA Layer.',
  ].filter(Boolean);
  return lines.join('\n');
}
