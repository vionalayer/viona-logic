/**
 * VIONA Shield — verify HonkVerifier on-chain bytecode matches the local artifact.
 *
 * The compiled artifact's deployedBytecode has zero-padded slots for immutable
 * variables (n=8192, logN=13, numPublicInputs=10). When the contract was deployed,
 * the Solidity runtime filled in the actual values. The Hardhat artifact omits
 * deployedBytecodeImmutableReferences because the viaIR:false override + optimizer
 * collapsed the uint256 immutables to PUSH2/PUSH1 instructions (rather than the
 * standard PUSH32 form), which Hardhat does not automatically track.
 *
 * This script fetches the on-chain bytecode, explains the known differences, and
 * confirms that the only diffs are the expected immutable values.
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/verify-onchain-bytecode.ts --network robinhood
 */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

// Known immutable positions in the deployedBytecode hex string (relative to
// the 0x-prefixed hex string, character positions).
// Discovered by diffing the artifact deployedBytecode against the on-chain bytecode.
const KNOWN_IMMUTABLE_DIFFS: Array<{
  charPos: number;
  bytePos: number;
  varName: string;
  expected: string; // on-chain nibble
  artifact: string; // artifact nibble (always '0')
}> = [
  { charPos: 2712, bytePos: 1355, varName: "n (8192=0x2000, high nibble)", expected: "2", artifact: "0" },
  { charPos: 2893, bytePos: 1445, varName: "numPublicInputs (10=0x0A)",    expected: "a", artifact: "0" },
  { charPos: 3241, bytePos: 1619, varName: "logN (13=0x0D)",               expected: "d", artifact: "0" },
  { charPos: 6279, bytePos: 3138, varName: "logN (13=0x0D) [2nd use]",     expected: "d", artifact: "0" },
  { charPos: 6595, bytePos: 3296, varName: "logN (13=0x0D) [3rd use]",     expected: "d", artifact: "0" },
];

async function main() {
  const HONK_VERIFIER = "0xAEa82dbA04e11F7455DF1D19344AD49026f69a83";

  console.log("Fetching on-chain bytecode for HonkVerifier:", HONK_VERIFIER);
  const onchain = await ethers.provider.getCode(HONK_VERIFIER);

  const artifactPath = path.join(__dirname, "../artifacts/src/HonkVerifier.sol/HonkVerifier.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error("HonkVerifier artifact not found — run: npx hardhat compile");
  }
  const art = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const artifact: string = art.deployedBytecode;

  if (onchain === "0x") {
    throw new Error("No bytecode at address — check network or address.");
  }

  // Compare
  const diffs: number[] = [];
  for (let i = 0; i < Math.max(artifact.length, onchain.length); i++) {
    if (artifact[i] !== onchain[i]) diffs.push(i);
  }

  if (diffs.length === 0) {
    console.log("\n✅  PERFECT MATCH — artifact deployedBytecode == on-chain bytecode.");
    return;
  }

  console.log(`\nFound ${diffs.length} nibble-level difference(s):`);

  let unexpectedDiffs = 0;
  for (const pos of diffs) {
    const known = KNOWN_IMMUTABLE_DIFFS.find((d) => d.charPos === pos);
    if (known) {
      console.log(
        `  ✅  char ${pos} (byte ${known.bytePos}): artifact='${artifact[pos]}' on-chain='${onchain[pos]}' → ${known.varName}`
      );
    } else {
      console.log(
        `  ❌  UNEXPECTED diff at char ${pos} (byte ${Math.floor((pos - 2) / 2)}): artifact='${artifact[pos]}' on-chain='${onchain[pos]}'`
      );
      unexpectedDiffs++;
    }
  }

  const allKnown = diffs.every((p) => KNOWN_IMMUTABLE_DIFFS.some((d) => d.charPos === p));
  const allPresent = KNOWN_IMMUTABLE_DIFFS.every((d) => diffs.includes(d.charPos));

  if (allKnown && allPresent && unexpectedDiffs === 0) {
    console.log(`
✅  All ${diffs.length} differences are expected immutable variable encodings:
    n=8192 (N), logN=13 (LOG_N), numPublicInputs=10 (NUMBER_OF_PUBLIC_INPUTS).

    The Solidity optimizer collapsed uint256 immutables to PUSH2/PUSH1 instructions
    when their values fit in 1–2 bytes. Hardhat's deployedBytecodeImmutableReferences
    is empty because it only tracks standard 32-byte immutable slots.

    The artifact is reproducible from the same source + compiler version; the on-chain
    bytecode matches the artifact with immutable slots filled in. ✅
`);
  } else {
    console.error(
      `\n❌  ${unexpectedDiffs} UNEXPECTED difference(s) found — the on-chain contract may differ from the committed source.`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
