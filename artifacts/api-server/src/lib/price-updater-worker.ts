/**
 * VIONA Price Updater Worker
 * Pushes fresh prices to VIONAPriceFeed on Robinhood Chain every 90 seconds.
 * Uses DEPLOYER_KEY env secret to sign transactions.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fetchQuotes } from "./yahoo-finance";
import { logger } from "./logger";

const INTERVAL_MS = 90 * 1000; // 90 seconds — well within the 3-minute staleness window

const PRICE_FEED_ADDRESS = "0xCB0Fc38a1310C03D7DE11279Fdf8b2332D5c9B36" as const;

const SYMBOLS = [
  "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOG", "META", "JPM", "SPY", "QQQ",
  "NFLX", "ORCL", "AMD", "INTC", "BA", "V", "MA", "WMT", "DIS", "UBER",
];

const PRICE_FEED_ABI = parseAbi([
  "function setPrices(string[] calldata symbols, uint256[] calldata prices) external",
  "function owner() external view returns (address)",
]);

const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com/"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.chain.robinhood.com/" },
  },
});

let walletClient: ReturnType<typeof createWalletClient> | null = null;
let publicClient: ReturnType<typeof createPublicClient> | null = null;

function initClients(): boolean {
  const rawKey = process.env["DEPLOYER_KEY"];
  if (!rawKey) {
    logger.warn("Price updater: DEPLOYER_KEY not set — price updates disabled");
    return false;
  }
  const key = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(key);

  publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
  walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http() });
  logger.info({ address: account.address }, "Price updater: initialized");
  return true;
}

async function pushPrices() {
  if (!walletClient || !publicClient) return;

  // Fetch latest prices from Yahoo Finance
  const quotes = await fetchQuotes(SYMBOLS);
  if (quotes.length === 0) {
    logger.warn("Price updater: no quotes returned from Yahoo Finance, skipping");
    return;
  }

  const symbols: string[] = [];
  const prices: bigint[] = [];

  for (const q of quotes) {
    if (q.regularMarketPrice > 0) {
      symbols.push(q.symbol.toUpperCase());
      // 6-decimal micro-units: $1 = 1_000_000
      prices.push(BigInt(Math.round(q.regularMarketPrice * 1_000_000)));
    }
  }

  if (symbols.length === 0) return;

  try {
    const hash = await walletClient.writeContract({
      address: PRICE_FEED_ADDRESS,
      abi: PRICE_FEED_ABI,
      functionName: "setPrices",
      args: [symbols, prices],
    });

    logger.info(
      { symbols: symbols.length, tx: hash },
      "Price updater: prices pushed on-chain"
    );
  } catch (err) {
    logger.warn({ err }, "Price updater: failed to push prices");
  }
}

export function startPriceUpdaterWorker() {
  if (!initClients()) return;

  // Run immediately on startup, then every 90 seconds
  void pushPrices();
  setInterval(() => void pushPrices(), INTERVAL_MS);
  logger.info({ intervalSec: INTERVAL_MS / 1000 }, "Price updater worker started");
}
