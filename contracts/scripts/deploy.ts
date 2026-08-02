/**
 * VIONA Shield — deployment script for Robinhood Chain (chainId 4663).
 *
 * Usage:
 *   export DEPLOYER_KEY=0x<your-private-key>
 *   cd contracts
 *   npx hardhat run scripts/deploy.ts --network robinhood
 *
 * After deploying:
 *   1. Copy the ShieldedPool address into artifacts/viona/src/lib/shield/contract.ts
 *      → CONTRACTS.pool = "<address>"
 *      → CONTRACTS.poolDeployBlock = <deployBlockNumber>n
 *   2. To upgrade the verifier once Noir circuits are compiled:
 *      npx hardhat run scripts/upgrade-verifier.ts --network robinhood
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  VIONA Shield Deployment`);
  console.log(`  Chain:    ${chainId}`);
  console.log(`  Deployer: ${deployer.address}`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:  ${ethers.formatEther(bal)} ETH`);
  console.log(`═══════════════════════════════════════════\n`);

  if (chainId !== 4663n) {
    console.warn(`⚠  Expected Robinhood Chain (4663) but got ${chainId}. Proceeding anyway.`);
  }

  // ── 1. Deploy StubVerifier ────────────────────────────────────────────────
  console.log("1/2  Deploying StubVerifier...");
  const StubVerifierFactory = await ethers.getContractFactory("StubVerifier");
  const stub = await StubVerifierFactory.deploy();
  await stub.waitForDeployment();
  const stubAddr = await stub.getAddress();
  console.log(`     StubVerifier: ${stubAddr}`);

  // ── 2. Deploy ShieldedPool ────────────────────────────────────────────────
  console.log("2/2  Deploying ShieldedPool...");
  const PoolFactory = await ethers.getContractFactory("ShieldedPool");
  const pool = await PoolFactory.deploy(stubAddr);
  await pool.waitForDeployment();
  const poolAddr  = await pool.getAddress();
  const deployTx  = pool.deploymentTransaction();
  const receipt   = await deployTx!.wait();
  const deployBlock = receipt!.blockNumber;
  console.log(`     ShieldedPool: ${poolAddr}`);
  console.log(`     Deploy block: ${deployBlock}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n✅  Deployment complete!\n`);
  console.log(`Update artifacts/viona/src/lib/shield/contract.ts:`);
  console.log(`  pool:             "${poolAddr}",`);
  console.log(`  poolDeployBlock:  ${deployBlock}n,`);
  console.log(`  stubVerifier:     "${stubAddr}", // upgrade later`);
  console.log(`\nNext steps:`);
  console.log(`  1. Set CONTRACTS.pool = "${poolAddr}"`);
  console.log(`  2. Set CONTRACTS.poolDeployBlock = ${deployBlock}n`);
  console.log(`  3. Compile Noir circuits → run bb contract → deploy real verifier`);
  console.log(`  4. Call pool.setVerifier(realVerifierAddress) to go live`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
