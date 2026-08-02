/**
 * VIONA Shield — deploy the bb-generated UltraHonk verifier and wire it up.
 *
 * Run after compiling Noir circuits and generating HonkVerifier.sol via:
 *   bb write_vk  -b circuits/transfer/target/viona_transfer.json -o circuits/transfer/target/vk_dir
 *   bb write_solidity_verifier -k circuits/transfer/target/vk_dir/vk -o contracts/src/HonkVerifier.sol
 *
 * Usage:
 *   export DEPLOYER_KEY=0x<your-private-key>
 *   export POOL_ADDRESS=0x<pool-address>         # ShieldedPool already on-chain
 *   cd contracts
 *   npx hardhat run scripts/deploy-honk-verifier.ts --network robinhood
 */

import { ethers } from "hardhat";

async function main() {
  const poolAddr = process.env.POOL_ADDRESS;
  if (!poolAddr) throw new Error("POOL_ADDRESS env var required");

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  VIONA Shield — Deploy Real ZK Verifier`);
  console.log(`  Chain:    ${chainId}`);
  console.log(`  Deployer: ${deployer.address}`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:  ${ethers.formatEther(bal)} ETH`);
  console.log(`  Pool:     ${poolAddr}`);
  console.log(`═══════════════════════════════════════════\n`);

  if (chainId !== 4663n) {
    console.warn(`⚠  Expected Robinhood Chain (4663) but got ${chainId}. Proceeding anyway.`);
  }

  // ── 1. Deploy HonkVerifier ────────────────────────────────────────────────
  console.log("1/2  Deploying HonkVerifier (bb-generated UltraHonk)...");
  const HonkFactory = await ethers.getContractFactory("HonkVerifier");
  const honk = await HonkFactory.deploy();
  await honk.waitForDeployment();
  const honkAddr = await honk.getAddress();
  const deployTx = honk.deploymentTransaction();
  const receipt  = await deployTx!.wait();
  console.log(`     HonkVerifier: ${honkAddr}`);
  console.log(`     Tx: ${receipt?.hash}`);

  // ── 2. Call pool.setVerifier() ────────────────────────────────────────────
  console.log("\n2/2  Calling pool.setVerifier(honkVerifierAddress)...");
  const pool = await ethers.getContractAt("ShieldedPool", poolAddr);
  const tx   = await pool.setVerifier(honkAddr);
  await tx.wait();
  console.log(`     Done. Tx: ${tx.hash}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n✅  Real ZK verifier deployed and wired!\n`);
  console.log(`Update artifacts/viona/src/lib/shield/contract.ts:`);
  console.log(`  honkVerifier: "${honkAddr}",`);
  console.log(`\nSpends now require a valid UltraHonk ZK proof.`);
  console.log(`StubVerifier is no longer active (retired).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
