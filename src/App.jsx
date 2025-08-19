import React, { useState } from "react";
import { connect, disconnect } from "@argent/get-starknet";
import { Contract } from "starknet";
import logo from "./assets/tubbly-logo.svg";

// Minimal ABI generated from Cairo contract
const ABI = [
  { "type": "function", "name": "prizeWei", "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },
  { "type": "function", "name": "entryFeeWei", "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },
  { "type": "function", "name": "play", "stateMutability": "payable", "inputs": [{ "name": "user_salt", "type": "felt" }], "outputs": [{ "type": "bool" }] },
  { "type": "function", "name": "claim", "stateMutability": "nonpayable", "inputs": [], "outputs": [] }
];

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

const NETWORKS = {
  SN_SEPOLIA: "0x534e5f5345504f4c4941",
  SN_MAIN: "0x534e5f4d41494e",
};

export default function App() {
  const [wallet, setWallet] = useState();
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [contract, setContract] = useState();
  const [fee, setFee] = useState(0n);
  const [tx, setTx] = useState("");
  const [error, setError] = useState("");

  async function connectWallet() {
    try {
      const w = await connect({ modalMode: "alwaysAsk" });
      setWallet(w);
      setAccount(w.account.address);
      const id = await w.provider.getChainId();
      setChainId(id);
      setContract(new Contract(ABI, CONTRACT_ADDRESS, w.account));
    } catch (err) {
      console.error(err);
    }
  }

  async function disconnectWallet() {
    await disconnect();
    setWallet(undefined);
    setAccount("");
    setContract(undefined);
    setChainId("");
    setFee(0n);
    setTx("");
  }

  async function switchNetwork(e) {
    if (!wallet) return;
    const id = e.target.value;
    try {
      await wallet.request({ method: "wallet_switchStarknetChain", params: [{ chainId: id }] });
      setChainId(id);
    } catch (err) {
      console.error("switch network", err);
    }
  }

  async function play() {
    if (!contract || !wallet) return;
    try {
      const salt = BigInt(Date.now());
      const call = contract.populate("play", [salt]);
      const est = await wallet.account.estimateInvokeFee(call);
      setFee(est.suggestedMaxFee);
      const res = await wallet.account.execute(call, { maxFee: est.suggestedMaxFee });
      setTx(res.transaction_hash);
    } catch (err) {
      if (String(err?.message || "").includes("INSUFFICIENT_FUNDS_FOR_FEE")) {
        setError("Insufficient funds for fee. Please fund your account and retry.");
      } else {
        setError(String(err));
      }
    }
  }

  async function claim() {
    if (!contract || !wallet) return;
    try {
      const call = contract.populate("claim", []);
      const est = await wallet.account.estimateInvokeFee(call);
      setFee(est.suggestedMaxFee);
      const res = await wallet.account.execute(call, { maxFee: est.suggestedMaxFee });
      setTx(res.transaction_hash);
    } catch (err) {
      if (String(err?.message || "").includes("INSUFFICIENT_FUNDS_FOR_FEE")) {
        setError("Insufficient funds for fee. Please fund your account and retry.");
      } else {
        setError(String(err));
      }
    }
  }

  return (
    <div className="p-4 text-white">
      <div className="flex justify-between items-center mb-4">
        <img src={logo} alt="logo" className="h-10" />
        {wallet ? (
          <button onClick={disconnectWallet} className="px-4 py-2 bg-red-600 rounded">Disconnect</button>
        ) : (
          <button onClick={connectWallet} className="px-4 py-2 bg-emerald-600 rounded">Connect</button>
        )}
      </div>

      {account && (
        <div className="mb-4">
          <div>Account: {account}</div>
          <div className="mt-2">
            <label className="mr-2">Network:</label>
            <select value={chainId} onChange={switchNetwork} className="text-black">
              <option value={NETWORKS.SN_SEPOLIA}>SN_SEPOLIA</option>
              <option value={NETWORKS.SN_MAIN}>SN_MAIN</option>
            </select>
          </div>
        </div>
      )}

      {account && (
        <div className="space-x-4 mb-4">
          <button onClick={play} className="px-4 py-2 bg-indigo-500 rounded">Play</button>
          <button onClick={claim} className="px-4 py-2 bg-blue-500 rounded">Claim</button>
        </div>
      )}

      {fee > 0n && <div className="mb-2">Estimated fee: {fee.toString()} wei</div>}
      {tx && (
        <div>
          Tx: <a href={`https://sepolia.starkscan.co/tx/${tx}`} target="_blank" rel="noreferrer" className="underline">{tx}</a>
        </div>
      )}
      {error && <div className="text-red-400 mt-2">{error}</div>}
    </div>
  );
}

