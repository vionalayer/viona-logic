/**
 * Deploy VIONAPriceFeed + VIONATrader to Robinhood Chain (4663).
 * Usage: cd contracts && npx hardhat run scripts/deploy-trader.ts --network robinhood
 */
import hre from "hardhat";
import fs from "fs";
import path from "path";

const USDG          = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const SHIELDED_POOL = "0xF6716fA1d5E58E1982a257d624571FB70b2B19Bf";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // ── 1. Deploy VIONAPriceFeed ───────────────────────────────────────────────
  console.log("\n[1/3] Deploying VIONAPriceFeed…");
  const PriceFeed = await hre.ethers.getContractFactory("VIONAPriceFeed");
  const priceFeed = await PriceFeed.deploy();
  await priceFeed.waitForDeployment();
  const priceFeedAddr = await priceFeed.getAddress();
  console.log("✓ VIONAPriceFeed:", priceFeedAddr);

  // ── 2. Deploy VIONATrader v2 (with Shield integration) ────────────────────
  console.log("\n[2/3] Deploying VIONATrader v2…");
  const Trader = await hre.ethers.getContractFactory("VIONATrader");
  const trader = await Trader.deploy(USDG, priceFeedAddr, SHIELDED_POOL, deployer.address);
  await trader.waitForDeployment();
  const traderAddr = await trader.getAddress();
  console.log("✓ VIONATrader:", traderAddr);

  // ── 3. Seed initial prices ────────────────────────────────────────────────
  console.log("\n[3/3] Seeding initial prices…");
  // Prices in USDG micro-units (6 decimals): $1 = 1_000_000
  const symbols = ["AAPL","TSLA","NVDA","MSFT","AMZN","GOOG","META","JPM","SPY","QQQ"];
  const prices  = [
    309_000_000n,  // AAPL  ~$309
    248_000_000n,  // TSLA  ~$248
    137_000_000n,  // NVDA  ~$137
    472_000_000n,  // MSFT  ~$472
    225_000_000n,  // AMZN  ~$225
    189_000_000n,  // GOOG  ~$189
    629_000_000n,  // META  ~$629
    268_000_000n,  // JPM   ~$268
    602_000_000n,  // SPY   ~$602
    510_000_000n,  // QQQ   ~$510
  ];
  const tx = await priceFeed.setPrices(symbols, prices);
  await tx.wait();
  console.log("✓ Prices seeded, tx:", tx.hash);

  // ── 4. Write addresses to JSON ────────────────────────────────────────────
  const out = {
    network: "robinhood",
    chainId: 4663,
    priceFeed: priceFeedAddr,
    trader:    traderAddr,
    usdg:      USDG,
    deployer:  deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../artifacts/trader-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\n✓ Addresses written to", outPath);

  // Also copy to viona frontend public dir
  const frontendPath = path.join(__dirname, "../../artifacts/viona/public/trader-addresses.json");
  fs.writeFileSync(frontendPath, JSON.stringify(out, null, 2));
  console.log("✓ Addresses copied to viona/public/trader-addresses.json");

  console.log("\n════════════════════════════════════════");
  console.log("VIONAPriceFeed:", priceFeedAddr);
  console.log("VIONATrader:   ", traderAddr);
  console.log("════════════════════════════════════════");
  console.log("\nNext: run scripts/update-prices.ts to keep prices fresh.");
}

main().catch((e) => { console.error(e); process.exit(1); });
