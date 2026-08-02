/**
 * VIONA Price Updater — pushes latest prices to VIONAPriceFeed on Robinhood Chain.
 * Run once manually or set up as a cron:
 *   cd contracts && npx hardhat run scripts/update-prices.ts --network robinhood
 */
import hre from "hardhat";
import fs from "fs";
import path from "path";

const PRICE_FEED_ABI = [
  "function setPrices(string[] calldata symbols, uint256[] calldata prices) external",
  "function getPrice(string calldata symbol) external view returns (uint256, uint256)",
];

const SYMBOLS = [
  "AAPL","TSLA","NVDA","MSFT","AMZN","GOOG","META","JPM","SPY","QQQ",
  "NFLX","ORCL","AMD","INTC","BA","V","MA","WMT","DIS","UBER",
];

async function fetchPrices(symbols: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const joined = symbols.join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}&fields=regularMarketPrice`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as {
      quoteResponse?: { result?: Array<{ symbol: string; regularMarketPrice?: number }> };
    };
    for (const q of json.quoteResponse?.result ?? []) {
      if (q.regularMarketPrice) map.set(q.symbol.toUpperCase(), q.regularMarketPrice);
    }
  } catch (e) {
    console.warn("Yahoo fetch failed:", (e as Error).message);
  }
  return map;
}

async function main() {
  // Load deployed addresses
  const addrPath = path.join(__dirname, "../artifacts/trader-addresses.json");
  if (!fs.existsSync(addrPath)) {
    throw new Error("trader-addresses.json not found — run deploy-trader.ts first");
  }
  const addrs = JSON.parse(fs.readFileSync(addrPath, "utf8"));
  const priceFeedAddr: string = addrs.priceFeed;

  const [signer] = await hre.ethers.getSigners();
  console.log("Updater:", signer.address);

  const priceFeed = new hre.ethers.Contract(priceFeedAddr, PRICE_FEED_ABI, signer);

  // Fetch latest prices
  console.log(`Fetching prices for ${SYMBOLS.length} symbols…`);
  const priceMap = await fetchPrices(SYMBOLS);

  const updSymbols: string[] = [];
  const updPrices: bigint[]  = [];

  for (const sym of SYMBOLS) {
    const usd = priceMap.get(sym);
    if (usd && usd > 0) {
      updSymbols.push(sym);
      // Convert to 6-decimal micro-units: $1 = 1_000_000
      updPrices.push(BigInt(Math.round(usd * 1_000_000)));
      console.log(`  ${sym.padEnd(6)} $${usd.toFixed(2)}`);
    } else {
      console.warn(`  ${sym.padEnd(6)} — no price`);
    }
  }

  if (updSymbols.length === 0) {
    console.error("No prices fetched — aborting");
    process.exit(1);
  }

  console.log(`\nPushing ${updSymbols.length} prices to VIONAPriceFeed ${priceFeedAddr}…`);
  const tx = await (priceFeed as any).setPrices(updSymbols, updPrices);
  const receipt = await tx.wait();
  console.log("✓ Prices updated, tx:", receipt.hash);
  console.log("Gas used:", receipt.gasUsed.toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
