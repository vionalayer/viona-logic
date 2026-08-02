/**
 * VIONA Shield — deploy ShieldedPool v2 (dual-verifier) with real spend verifier.
 *
 * Deploys ShieldedPool with:
 *   spendVerifier  = HonkVerifier (real UltraHonk, already deployed)
 *   shieldVerifier = StubVerifier (always-true, until shield circuit ships)
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/deploy-pool-v2.ts --network robinhood
 *
 * Required secrets in Replit:
 *   DEPLOYER_KEY — private key of the deployment wallet
 *
 * Pre-existing addresses (Robinhood Chain):
 *   HonkVerifier : 0xAEa82dbA04e11F7455DF1D19344AD49026f69a83
 *   StubVerifier : 0x82291667D9955aDA131ebd345eF740367376770D
 */

import { ethers } from "hardhat";

const HONK_VERIFIER  = "0xAEa82dbA04e11F7455DF1D19344AD49026f69a83";
const STUB_VERIFIER  = "0x82291667D9955aDA131ebd345eF740367376770D";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  VIONA Shield — Deploy ShieldedPool v2 (dual verifier)`);
  console.log(`  Chain:          ${network.chainId} (${network.name})`);
  console.log(`  Deployer:       ${deployer.address}`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:        ${ethers.formatEther(bal)} ETH`);
  console.log(`  spendVerifier:  ${HONK_VERIFIER}`);
  console.log(`  shieldVerifier: ${STUB_VERIFIER}`);
  console.log(`═══════════════════════════════════════════════════\n`);

  if (network.chainId !== 4663n) {
    console.warn(`⚠  Expected Robinhood Chain (4663) but got ${network.chainId}. Proceeding.`);
  }

  // ── Deploy ShieldedPool v2 ───────────────────────────────────────────────
  console.log("Deploying ShieldedPool (spendVerifier=HonkVerifier, shieldVerifier=StubVerifier)…");
  const PoolFactory = await ethers.getContractFactory("ShieldedPool");
  const pool = await PoolFactory.deploy(HONK_VERIFIER, STUB_VERIFIER);
  await pool.waitForDeployment();
  const poolAddr    = await pool.getAddress();
  const deployTx    = pool.deploymentTransaction();
  const receipt     = await deployTx!.wait();

  console.log(`\n✅  ShieldedPool v2 deployed!`);
  console.log(`    Address:      ${poolAddr}`);
  console.log(`    Tx:           ${receipt?.hash}`);
  console.log(`    Block:        ${receipt?.blockNumber}`);

  // ── Verify verifier slots ────────────────────────────────────────────────
  const sv  = await (pool as unknown as { spendVerifier():  Promise<string> }).spendVerifier();
  const shv = await (pool as unknown as { shieldVerifier(): Promise<string> }).shieldVerifier();
  console.log(`    spendVerifier:  ${sv}`);
  console.log(`    shieldVerifier: ${shv}`);

  console.log(`
Update artifacts/viona/src/lib/shield/contract.ts:
  pool:            "${poolAddr}",
  poolDeployBlock: ${receipt?.blockNumber}n,
`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
