/**
 * Poseidon2BN254.sol test -- verifies on-chain hash matches zkpassport/poseidon2 JS library.
 * Run: cd contracts && npx hardhat test
 */
import { ethers } from "hardhat";
import assert from "assert";

describe("Poseidon2BN254", function () {
  this.timeout(60_000);

  async function deploy() {
    const factory = await ethers.getContractFactory("Poseidon2Test");
    const c = await factory.deploy();
    await c.waitForDeployment();
    return c as any;
  }

  // Test vectors from: poseidon2Hash([...]) in @zkpassport/poseidon2 v0.6.2
  it("hash2(0, 0) matches JS library", async function () {
    const c = await deploy();
    const result: bigint = await c.hash2(0n, 0n);
    const expected = 5151499478991301833156025595048985053689893395646836724335623777508747990769n;
    assert.strictEqual(result, expected, `got 0x${result.toString(16)}`);
    console.log("  hash2(0,0) OK:", "0x" + result.toString(16).padStart(64, "0"));
  });

  it("hash2(1, 2) matches JS library", async function () {
    const c = await deploy();
    const result: bigint = await c.hash2(1n, 2n);
    const expected = 1594597865669602199208529098208508950092942746041644072252494753744672355203n;
    assert.strictEqual(result, expected, `got 0x${result.toString(16)}`);
    console.log("  hash2(1,2) OK:", "0x" + result.toString(16).padStart(64, "0"));
  });

  it("hash2(5, 6) matches JS library", async function () {
    const c = await deploy();
    const result: bigint = await c.hash2(5n, 6n);
    const expected = 12096576599834478317592210225257899548976626129824898535087186730386772533086n;
    assert.strictEqual(result, expected, `got 0x${result.toString(16)}`);
    console.log("  hash2(5,6) OK:", "0x" + result.toString(16).padStart(64, "0"));
  });

  it("hash4(1, 2, 3, 4) matches JS library", async function () {
    const c = await deploy();
    const result: bigint = await c.hash4(1n, 2n, 3n, 4n);
    const expected = 8615049788434614272061777381929479688528564767750167561409097996914085376441n;
    assert.strictEqual(result, expected, `got 0x${result.toString(16)}`);
    console.log("  hash4(1,2,3,4) OK:", "0x" + result.toString(16).padStart(64, "0"));
  });
});
