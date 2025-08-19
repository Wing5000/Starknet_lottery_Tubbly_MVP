import { RpcProvider, Contract } from "starknet";
import fs from "fs";

const ABI = [
  { type: "function", name: "prizeWei", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }
];

const address = process.env.VITE_CONTRACT_ADDRESS;
const rpc = process.env.VITE_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_6";

async function main() {
  if (!address) {
    console.error("VITE_CONTRACT_ADDRESS not set");
    process.exit(1);
  }
  const provider = new RpcProvider({ nodeUrl: rpc });
  const contract = new Contract(ABI, address, provider);
  const prize = await contract.prizeWei();
  console.log("prizeWei", prize.toString());
}

main();
