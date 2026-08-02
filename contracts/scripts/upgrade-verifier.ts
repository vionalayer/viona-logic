/**
 * VIONA Shield — upgrade the ZK verifier on an already-deployed ShieldedPool.
 *
 * Run after compiling Noir circuits and deploying the bb-generated verifier:
 *   export DEPLOYER_KEY=0x<your-private-key>
 *   export POOL_ADDRESS=0x<pool-address>
 *   export VERIFIER_ADDRESS=0x<real-verifier-address>
 *   cd contracts
 *   npx hardhat run scripts/upgrade-verifier.ts --network robinhood
 */

import { ethers } from "hardhat";

async function main() {
  const poolAddr     = process.env.POOL_ADDRESS;
  const verifierAddr = process.env.VERIFIER_ADDRESS;

  if (!poolAddr)     throw new Error("POOL_ADDRESS env var required");
  if (!verifierAddr) throw new Error("VERIFIER_ADDRESS env var required");

  const [owner] = await ethers.getSigners();
  console.log(`Upgrading verifier on pool ${poolAddr}`);
  console.log(`New verifier: ${verifierAddr}`);
  console.log(`Owner signer: ${owner.address}`);

  const pool = await ethers.getContractAt("ShieldedPool", poolAddr);
  const tx   = await pool.setVerifier(verifierAddr);
  await tx.wait();
  console.log(`\n✅  Verifier upgraded. Tx: ${tx.hash}`);
  console.log(`Spends are now verified with real ZK proofs.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
