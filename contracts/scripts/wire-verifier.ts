/**
 * Wire a newly-deployed HonkVerifier to the ShieldedPool's spend slot.
 * Uses ethers from the hardhat plugin (no extra deps).
 *
 * Usage:
 *   POOL_ADDRESS=0x... VERIFIER_ADDRESS=0x... \
 *     npx hardhat run scripts/wire-verifier.ts --network robinhood
 */
import { ethers } from "hardhat";

const SET_SPEND_VERIFIER = "function setSpendVerifier(address) external";
const SPEND_VERIFIER_VIEW = "function spendVerifier() view returns (address)";

async function main() {
  const poolAddr     = process.env.POOL_ADDRESS!;
  const verifierAddr = process.env.VERIFIER_ADDRESS!;
  if (!poolAddr)     throw new Error("POOL_ADDRESS required");
  if (!verifierAddr) throw new Error("VERIFIER_ADDRESS required");

  const [owner] = await ethers.getSigners();
  console.log("Deployer:", owner.address);
  console.log("Pool:    ", poolAddr);
  console.log("Verifier:", verifierAddr);

  const pool = new ethers.Contract(
    poolAddr,
    [SET_SPEND_VERIFIER, SPEND_VERIFIER_VIEW],
    owner,
  );

  console.log("\nCalling setSpendVerifier...");
  const tx = await pool.setSpendVerifier(verifierAddr);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("✅ spendVerifier updated to:", verifierAddr);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
