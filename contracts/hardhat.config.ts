import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

// Load deployer private key from env (never commit keys!)
// Set with:  export DEPLOYER_KEY=0x<your-key>
const DEPLOYER_KEY = process.env.DEPLOYER_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.27",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    ],
    // The bb-generated HonkVerifier uses raw assembly without memory-safe
    // annotations, which is incompatible with the viaIR pipeline.
    // Compile it with the legacy pipeline instead.
    overrides: {
      "src/HonkVerifier.sol": {
        version: "0.8.27",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          // viaIR must be false: the bb-generated assembly has raw inline assembly
          // without memory-safe annotations, incompatible with the viaIR pipeline.
          viaIR: false,
          // Note: deployedBytecode in the artifact has zero-padded PUSH2/PUSH1 slots
          // for immutable variables (n=8192, logN=13, numPublicInputs=10) because the
          // optimizer collapsed them from PUSH32 to smaller opcodes that Hardhat cannot
          // automatically track in deployedBytecodeImmutableReferences.
          // Run: npx hardhat run scripts/verify-onchain-bytecode.ts --network robinhood
          // to confirm all differences are exactly the expected immutable values.
        },
      },
    },
  },
  networks: {
    // Robinhood Chain mainnet
    robinhood: {
      url: "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
    // Local Hardhat network for tests
    hardhat: {
      chainId: 31337,
    },
  },
  paths: {
    sources:   "./src",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
