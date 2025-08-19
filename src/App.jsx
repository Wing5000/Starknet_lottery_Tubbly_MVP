import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Contract, RpcProvider, cairo, stark } from "starknet";
import { CONTRACT_ABI } from "./contractABI";
import { 
  formatEther, 
  parseEther, 
  pctFromPpm, 
  ppmFromPct, 
  toBigInt, 
  shortAddr 
} from "./utils/helpers";
import logo from "./assets/tubbly-logo.svg";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x75d13ac0cb15587532e4c1a208d3ffddf97fb60c35c7be3b891388054def324";

const SEPOLIA_RPC = "https://starknet-sepolia.public.blastapi.io/rpc/v0_7";

export default function App() {
  // Connection state
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState(null);
  const [address, setAddress] = useState("");
  const [contract, setContract] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  // Contract state
  const [prizeWei, setPrizeWei] = useState(0n);
  const [feeWei, setFeeWei] = useState(0n);
  const [chancePpm, setChancePpm] = useState(0);
  const [contractBal, setContractBal] = useState(0n);
  const [pendingMine, setPendingMine] = useState(0n);
  const [lastPlayedBlock, setLastPlayedBlock] = useState(0n);
  const [currentBlock, setCurrentBlock] = useState(0n);
  const [nextAllowedBlock, setNextAllowedBlock] = useState(0n);
  const [canPlay, setCanPlay] = useState(false);

  // UI state
  const [salt, setSalt] = useState(String(Math.floor(Math.random() * 1e12)));
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [wonState, setWonState] = useState(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [fundAmt, setFundAmt] = useState("");

  // Owner panel
  const [pPrize, setPPrize] = useState("0.0001");
  const [pFee, setPFee] = useState("0");
  const [pPct, setPPct] = useState("1");

  // Initialize provider on mount
  useEffect(() => {
    const initProvider = async () => {
      try {
        const rpcProvider = new RpcProvider({ nodeUrl: SEPOLIA_RPC });
        setProvider(rpcProvider);
        console.log("Provider initialized");
      } catch (error) {
        console.error("Provider init error:", error);
        setConnectionError("Failed to initialize provider");
      }
    };
    initProvider();
  }, []);

  // Load contract data
  const loadContractData = useCallback(async (userAddress = null) => {
    if (!provider) return;

    try {
      const readContract = new Contract(CONTRACT_ABI, CONTRACT_ADDRESS, provider);
      
      // Basic contract info
      const [prize, fee, chance, balance, block] = await Promise.all([
        readContract.prizeWei().catch(() => 0n),
        readContract.entryFeeWei().catch(() => 0n),
        readContract.winChancePpm().catch(() => 0),
        readContract.contractBalance().catch(() => 0n),
        provider.getBlockNumber().catch(() => 0)
      ]);

      setPrizeWei(toBigInt(prize));
      setFeeWei(toBigInt(fee));
      setChancePpm(Number(chance));
      setContractBal(toBigInt(balance));
      setCurrentBlock(BigInt(block));

      // User-specific data
      if (userAddress) {
        const [pending, lastPlayed, nextAllowed, canPlayNow, ownerAddr] = await Promise.all([
          readContract.get_pending_prizes(userAddress).catch(() => 0n),
          readContract.get_user_last_played_block(userAddress).catch(() => 0n),
          readContract.get_next_allowed_block(userAddress).catch(() => 0n),
          readContract.get_can_play(userAddress).catch(() => false),
          readContract.owner().catch(() => "0x0")
        ]);

        setPendingMine(toBigInt(pending));
        setLastPlayedBlock(toBigInt(lastPlayed));
        setNextAllowedBlock(toBigInt(nextAllowed));
        setCanPlay(Boolean(canPlayNow));
        
        const ownerHex = typeof ownerAddr === 'string' ? ownerAddr : `0x${ownerAddr.toString(16)}`;
        setIsOwner(ownerHex.toLowerCase() === userAddress.toLowerCase());
      }
    } catch (error) {
      console.error("Load data error:", error);
    }
  }, [provider]);

  // Connect wallet
  const connect = async () => {
    setIsConnecting(true);
    setConnectionError("");
    setStatus("");
    
    try {
      // Check for Braavos wallet
      if (!window.starknet_braavos) {
        setConnectionError("Braavos wallet not found");
        window.open("https://braavos.app/", "_blank");
        return;
      }

      // Request connection
      const result = await window.starknet_braavos.enable();
      
      if (!result || result.length === 0) {
        throw new Error("Connection rejected");
      }

      const walletAddress = result[0];
      const walletAccount = window.starknet_braavos.account;
      
      setAddress(walletAddress);
      setAccount(walletAccount);
      
      // Create contract instance
      const contractInstance = new Contract(
        CONTRACT_ABI,
        CONTRACT_ADDRESS,
        walletAccount
      );
      setContract(contractInstance);
      
      setStatus("Wallet connected!");
      await loadContractData(walletAddress);
      
    } catch (error) {
      console.error("Connect error:", error);
      setConnectionError(error.message || "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnect = () => {
    setAccount(null);
    setAddress("");
    setContract(null);
    setIsOwner(false);
    setStatus("Disconnected");
    setWonState(null);
  };

  // Auto refresh data
  useEffect(() => {
    if (!address || !provider) return;
    
    const interval = setInterval(() => {
      loadContractData(address);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [address, provider, loadContractData]);

  // Play lottery
  const doPlay = async () => {
    if (!contract || !account) {
      setStatus("Connect wallet first");
      return;
    }

    if (!canPlay) {
      setStatus("Wait for next block");
      return;
    }

    setLoading(true);
    setWonState(null);
    setStatus("");
    setProgressMessage("Preparing transaction...");

    try {
      // Build the call
      const myCall = contract.populate("play", [salt]);
      
      // Add value if fee required
      const executeParams = feeWei > 0n ? { value: feeWei.toString() } : undefined;
      
      setProgressMessage("Confirm in wallet...");
      
      // Execute transaction
      const result = await account.execute(myCall, undefined, executeParams);
      
      setProgressMessage("Transaction sent...");
      
      // Wait for confirmation
      await provider.waitForTransaction(result.transaction_hash);
      
      setProgressMessage("Checking result...");
      
      // Get receipt and check events
      const receipt = await provider.getTransactionReceipt(result.transaction_hash);
      
      // Parse result from events
      let won = false;
      if (receipt.events && receipt.events.length > 0) {
        for (const event of receipt.events) {
          // Check for Result event
          const eventKey = event.keys?.[0];
          const resultEventHash = stark.hash.getSelectorFromName("Result");
          
          if (eventKey === resultEventHash) {
            // Second data field is the won boolean
            won = event.data?.[1] === "0x1";
            break;
          }
        }
      }
      
      setWonState(won);
      setStatus(won ? "🎉 You WON!" : "Better luck next time!");
      
      // Generate new salt for next play
      setSalt(String(Math.floor(Math.random() * 1e12)));
      
      // Reload data
      await loadContractData(address);
      
    } catch (error) {
      console.error("Play error:", error);
      if (error.message?.includes("reject")) {
        setStatus("Transaction rejected");
      } else {
        setStatus(`Error: ${error.message || "Transaction failed"}`);
      }
    } finally {
      setLoading(false);
      setProgressMessage("");
    }
  };

  // Claim prizes
  const doClaim = async () => {
    if (!contract || !account) {
      setStatus("Connect wallet first");
      return;
    }

    if (pendingMine === 0n) {
      setStatus("No prizes to claim");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const myCall = contract.populate("claim", []);
      const result = await account.execute(myCall);
      
      await provider.waitForTransaction(result.transaction_hash);
      
      setStatus("Prizes claimed!");
      await loadContractData(address);
      
    } catch (error) {
      console.error("Claim error:", error);
      setStatus(`Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fund contract
  const doFund = async () => {
    if (!contract || !account) {
      setStatus("Connect wallet first");
      return;
    }

    if (!fundAmt || parseFloat(fundAmt) <= 0) {
      setStatus("Enter valid amount");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const amount = parseEther(fundAmt);
      const myCall = contract.populate("fund", []);
      const result = await account.execute(myCall, undefined, {
        value: amount.low.toString()
      });
      
      await provider.waitForTransaction(result.transaction_hash);
      
      setStatus("Funded successfully!");
      setFundAmt("");
      await loadContractData(address);
      
    } catch (error) {
      console.error("Fund error:", error);
      setStatus(`Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update params (owner only)
  const applyParams = async () => {
    if (!contract || !account || !isOwner) {
      setStatus("Owner only");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const prize = parseEther(pPrize);
      const fee = parseEther(pFee);
      const ppm = ppmFromPct(pPct);

      const myCall = contract.populate("setParams", [prize, fee, ppm]);
      const result = await account.execute(myCall);
      
      await provider.waitForTransaction(result.transaction_hash);
      
      setStatus("Parameters updated!");
      await loadContractData(address);
      
    } catch (error) {
      console.error("Update error:", error);
      setStatus(`Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // UI Components
  const Label = ({ children }) => (
    <span className="text-xs uppercase tracking-wider text-zinc-400">{children}</span>
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-black via-zinc-900 to-black text-zinc-100">
      {/* Header */}
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Tubbly" className="h-8 w-auto" />
          <div className="font-semibold text-xl">Instant Lottery (Sepolia)</div>
        </div>
        <div className="flex items-center gap-3">
          {address ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-300">{shortAddr(address)}</span>
              <button
                className="px-3 py-1 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700 text-sm"
                onClick={() => navigator.clipboard.writeText(address)}
              >
                Copy
              </button>
              <button
                className="px-3 py-1 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700 text-sm"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-semibold shadow disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {connectionError && (
        <div className="mx-auto max-w-6xl px-4 mb-4">
          <div className="p-3 rounded-xl bg-red-900/20 border border-red-500/40 text-red-300">
            {connectionError}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          {/* Play panel */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-extrabold tracking-tight">Spin the Wheel</div>
                <div className="text-zinc-400">One try per address per block!</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{formatEther(prizeWei)} ETH</div>
                <div className="text-zinc-400 text-sm">Current prize</div>
              </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800 p-4">
                <Label>Win Chance</Label>
                <div className="text-xl font-semibold">{pctFromPpm(chancePpm)}%</div>
              </div>
              <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800 p-4">
                <Label>Entry Fee</Label>
                <div className="text-xl font-semibold">{formatEther(feeWei)} ETH</div>
              </div>
              <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800 p-4">
                <Label>Contract Balance</Label>
                <div className="text-xl font-semibold">{formatEther(contractBal)} ETH</div>
              </div>
            </div>

            <div className="mt-6">
              <Label>Random Salt</Label>
              <div className="mt-1 flex flex-col sm:flex-row gap-3">
                <input
                  className="flex-1 px-4 py-3 rounded-2xl bg-black/60 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Random number"
                  value={salt}
                  onChange={(e) => setSalt(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  onClick={doPlay}
                  disabled={!address || loading || !canPlay}
                  className={`px-6 py-3 rounded-2xl font-bold text-lg shadow transition ${
                    !address || loading || !canPlay
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-amber-500 hover:bg-amber-400 text-black"
                  }`}
                >
                  {!address ? "Connect Wallet" : !canPlay ? "Wait Next Block" : loading ? "Playing..." : "Play"}
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="mt-4 min-h-[44px]">
              <AnimatePresence>
                {wonState === true && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300"
                  >
                    🎉 YOU WON {formatEther(prizeWei)} ETH! 🎉
                  </motion.div>
                )}
                {wonState === false && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center px-4 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300"
                  >
                    You lost. Try again!
                  </motion.div>
                )}
                {status && !loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center px-4 py-2 rounded-xl bg-amber-600/20 border border-amber-500/40 text-amber-300"
                  >
                    {status}
                  </motion.div>
                )}
                {loading && progressMessage && (
                  <div className="relative bg-zinc-700 rounded-full h-6 overflow-hidden">
                    <div className="progress-bar bg-indigo-400 h-full flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">{progressMessage}</span>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        {/* Side panels */}
        <div className="space-y-4">
          {/* Wallet info */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-lg font-semibold mb-3">Your Status</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label>Can Play</Label>
                <div className={canPlay ? "text-emerald-400" : "text-zinc-400"}>
                  {canPlay ? "Yes ✓" : "No ✗"}
                </div>
              </div>
              <div>
                <Label>Current Block</Label>
                <div>{currentBlock.toString()}</div>
              </div>
              <div>
                <Label>Last Played</Label>
                <div>{lastPlayedBlock.toString()}</div>
              </div>
              <div>
                <Label>Next Allowed</Label>
                <div>{nextAllowedBlock.toString()}</div>
              </div>
              <div className="col-span-2">
                <Label>Pending Prizes</Label>
                <div className="text-lg font-bold">{formatEther(pendingMine)} ETH</div>
              </div>
            </div>
            <button
              onClick={doClaim}
              disabled={!address || loading || pendingMine === 0n}
              className={`mt-4 w-full px-4 py-2 rounded-2xl font-semibold transition ${
                pendingMine > 0n
                  ? "bg-emerald-500 text-black hover:bg-emerald-400"
                  : "bg-zinc-800 text-zinc-400 cursor-not-allowed"
              }`}
            >
              Claim Prizes
            </button>
          </div>

          {/* Fund */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-lg font-semibold mb-3">Fund the Pot</div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Amount (ETH)"
                value={fundAmt}
                onChange={(e) => setFundAmt(e.target.value)}
                type="number"
                step="0.001"
              />
              <button
                onClick={doFund}
                disabled={!address || loading}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-black font-semibold disabled:opacity-50"
              >
                Fund
              </button>
            </div>
          </div>

          {/* Owner Panel */}
          {isOwner && (
            <div className="rounded-3xl border border-amber-700/40 bg-amber-900/10 p-5">
              <div className="text-lg font-semibold mb-3">Owner Panel</div>
              <div className="space-y-2">
                <div>
                  <Label>Prize (ETH)</Label>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-700/40"
                    value={pPrize}
                    onChange={(e) => setPPrize(e.target.value)}
                    type="number"
                    step="0.001"
                  />
                </div>
                <div>
                  <Label>Fee (ETH)</Label>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-700/40"
                    value={pFee}
                    onChange={(e) => setPFee(e.target.value)}
                    type="number"
                    step="0.001"
                  />
                </div>
                <div>
                  <Label>Win Chance (%)</Label>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-amber-700/40"
                    value={pPct}
                    onChange={(e) => setPPct(e.target.value)}
                    type="number"
                    step="0.1"
                    max="100"
                  />
                </div>
              </div>
              <button
                onClick={applyParams}
                disabled={!address || loading}
                className="mt-3 w-full px-4 py-2 rounded-2xl bg-amber-500 text-black font-bold hover:bg-amber-400 disabled:opacity-50"
              >
                Update Parameters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mx-auto max-w-6xl px-4 py-10 text-xs text-zinc-500">
        <div>Contract: {CONTRACT_ADDRESS}</div>
        <div>Network: StarkNet Sepolia Testnet</div>
      </div>
    </div>
  );
}
