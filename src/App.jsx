import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatEther, parseEther } from "ethers";
import { Contract, uint256 } from "starknet";
import logo from "./assets/tubbly-logo.svg";

// Address of the deployed lottery contract
// Can be overridden via VITE_CONTRACT_ADDRESS env variable for flexibility
const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x75d13ac0cb15587532e4c1a208d3ffddf97fb60c35c7be3b891388054def324";

// Fully qualified entrypoint names used by the Cairo v1 contract
const FN = {
  prizeWei: "BlockInstantLottery::prizeWei",
  entryFeeWei: "BlockInstantLottery::entryFeeWei",
  winChancePpm: "BlockInstantLottery::winChancePpm",
  owner: "BlockInstantLottery::owner",
  contractBalance: "BlockInstantLottery::contractBalance",
  getUserLastPlayedBlock: "BlockInstantLottery::get_user_last_played_block",
  getPendingPrizes: "BlockInstantLottery::get_pending_prizes",
  getCanPlay: "BlockInstantLottery::get_can_play",
  getNextAllowedBlock: "BlockInstantLottery::get_next_allowed_block",
  play: "BlockInstantLottery::play",
  claim: "BlockInstantLottery::claim",
  fund: "BlockInstantLottery::fund",
  ownerWithdraw: "BlockInstantLottery::ownerWithdraw",
  setParams: "BlockInstantLottery::setParams",
};

const EV = {
  Result: "BlockInstantLottery::Result",
  PrizePaid: "BlockInstantLottery::PrizePaid",
  PrizePending: "BlockInstantLottery::PrizePending",
  ParamsUpdated: "BlockInstantLottery::ParamsUpdated",
};

// Minimal ABI for the functions/events we use
const ABI = [
  // --- Read ---
  { type: "function", name: FN.prizeWei, stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: FN.entryFeeWei, stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: FN.winChancePpm, stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: FN.owner, stateMutability: "view", inputs: [], outputs: [{ type: "felt" }] },
  { type: "function", name: FN.contractBalance, stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: FN.getUserLastPlayedBlock, stateMutability: "view", inputs: [{ name: "user", type: "felt" }], outputs: [{ type: "felt" }] },
  { type: "function", name: FN.getPendingPrizes, stateMutability: "view", inputs: [{ name: "user", type: "felt" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: FN.getCanPlay, stateMutability: "view", inputs: [{ name: "user", type: "felt" }], outputs: [{ type: "bool" }] },
  { type: "function", name: FN.getNextAllowedBlock, stateMutability: "view", inputs: [{ name: "user", type: "felt" }], outputs: [{ type: "felt" }] },

  // --- Write ---
  {
    type: "function",
    name: FN.play,
    stateMutability: "payable",
    inputs: [{ name: "userSalt", type: "felt" }],
    outputs: [{ type: "bool" }]
  },
  { type: "function", name: FN.claim, stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: FN.fund, stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: FN.ownerWithdraw, stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: FN.setParams, stateMutability: "nonpayable", inputs: [
      { name: "_prizeWei", type: "uint256" },
      { name: "_feeWei", type: "uint256" },
      { name: "_winChancePpm", type: "uint32" }
  ], outputs: [] },

  // --- Events we decode ---
  { type: "event", name: EV.Result, inputs: [
      { name: "player", type: "felt", indexed: true },
      { name: "won", type: "bool", indexed: false },
      { name: "prize_amount", type: "uint256", indexed: false }
  ] },
  { type: "event", name: EV.PrizePaid, inputs: [
      { name: "to", type: "felt", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
  ] },
  { type: "event", name: EV.PrizePending, inputs: [
      { name: "to", type: "felt", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
  ] },
  { type: "event", name: EV.ParamsUpdated, inputs: [
      { name: "prize_wei", type: "uint256", indexed: false },
      { name: "entry_fee_wei", type: "uint256", indexed: false },
      { name: "win_chance_ppm", type: "uint32", indexed: false }
  ] },
];

const PPM_DEN = 1_000_000;
const STARKNET_SEPOLIA_CHAIN_ID = "0x534e5f5345504f4c4941";

function pctFromPpm(ppm) {
  return Number(ppm) / 10_000; // 10000 ppm = 1%
}

function ppmFromPct(pct) {
  return Math.round(parseFloat(String(pct)) * 10_000);
}

function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (value && typeof value === "object" && "low" in value && "high" in value) {
    return uint256.uint256ToBN(value);
  }
  return BigInt(value ?? 0);
}

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [networkOk, setNetworkOk] = useState(false);
  const [contract, setContract] = useState(null);

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
  const [progressMessage, setProgressMessage] = useState("Drawing in progress...");
  const [rejected, setRejected] = useState(false);
  const [logLines, setLogLines] = useState([]);
  const [recentResults, setRecentResults] = useState([]);

  const addLog = (entry) => setLogLines((l) => [entry, ...l].slice(0, 50));
  const shortAddr = (a) => {
    if (!a) return "";
    const s = String(a);
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  };
  const shortHash = (h) => {
    if (!h) return "";
    const s = String(h);
    return `${s.slice(0, 10)}…`;
  };

  useEffect(() => {
    const wallet = window.starknet_braavos;
    if (!wallet) return;
    setProvider(wallet.provider);
    const c = new Contract(ABI, CONTRACT_ADDRESS, wallet.provider);
    setContract(c);
  }, []);

  async function connect() {
    const wallet = window.starknet_braavos;
    if (!wallet) {
      // Redirect users to Braavos site if no Starknet wallet is detected
      window.open("https://braavos.app/", "_blank");
      return;
    }

    try {
      await wallet.enable();
    } catch {
      alert("Connection to Starknet wallet was rejected.");
      return;
    }

    setProvider(wallet.provider);
    setSigner(wallet.account);
    const accountAddr = wallet.account.address;
    setAccount(accountAddr);

    const c = new Contract(ABI, CONTRACT_ADDRESS, wallet.account);
    setContract(c);

    try {
      const chainId = await wallet.provider.getChainId();
      setNetworkOk(chainId === STARKNET_SEPOLIA_CHAIN_ID);
      if (chainId !== STARKNET_SEPOLIA_CHAIN_ID) {
        try {
          await wallet.request({
            method: "wallet_switchStarknetChain",
            params: [{ chainId: STARKNET_SEPOLIA_CHAIN_ID }],
          });
        } catch {}
      }
    } catch {}

    if (accountAddr) {
      try {
        const [blk, next, last, can] = await Promise.all([
          wallet.provider.getBlockNumber(),
          c[FN.getNextAllowedBlock](accountAddr),
          c[FN.getUserLastPlayedBlock](accountAddr),
          c[FN.getCanPlay](accountAddr),
        ]);
        setCurrentBlock(BigInt(blk));
        setNextAllowedBlock(toBigInt(next));
        setLastPlayedBlock(toBigInt(last));
        setCanPlay(Boolean(can));
      } catch (e) {
        console.error("Error loading user data on connect:", e);
      }
    }
  }

  function disconnect() {
    setProvider(null);
    setSigner(null);
    setAccount("");
    setContract(null);
    setNetworkOk(false);
    setPendingMine(0n);
    setLastPlayedBlock(0n);
    setCurrentBlock(0n);
    setNextAllowedBlock(0n); // POPRAWKA: Resetuj także nextAllowedBlock
    setCanPlay(false);
    setWonState(null); // POPRAWKA: Resetuj stan wygranej
    setStatus(""); // POPRAWKA: Wyczyść status
  }

  useEffect(() => {
    if (!contract) return;
    let mounted = true;

    async function loadBasics() {
      try {
        const [p, f, w, bal] = await Promise.all([
          contract[FN.prizeWei](),
          contract[FN.entryFeeWei](),
          contract[FN.winChancePpm](),
          contract[FN.contractBalance](),
        ]);
        if (!mounted) return;
        setPrizeWei(toBigInt(p));
        setFeeWei(toBigInt(f));
        setChancePpm(Number(w));
        setContractBal(toBigInt(bal));
      } catch (e) {
        console.error("Error loading contract basics:", e);
      }
    }

    loadBasics();
    const iv = setInterval(loadBasics, 5000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [contract]);

  // POPRAWKA: Dodaj listener na zmianę bloku który aktualizuje nextAllowedBlock
  useEffect(() => {
    if (!provider || !account || !contract) return;
    let mounted = true;

    async function pollBlock() {
      if (!mounted) return;
      try {
        const [blockNumber, next, can] = await Promise.all([
          provider.getBlockNumber(),
          contract[FN.getNextAllowedBlock](account),
          contract[FN.getCanPlay](account),
        ]);
        setCurrentBlock(BigInt(blockNumber));
        if (mounted) {
          setNextAllowedBlock(toBigInt(next));
          setCanPlay(Boolean(can));
        }
      } catch (e) {
        console.error("Error updating nextAllowedBlock:", e);
      }
    }

    pollBlock();
    const iv = setInterval(pollBlock, 5000);

    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [provider, account, contract]);

  useEffect(() => {
    if (!contract || !provider) return;
    if (!contract.queryFilter || !contract.filters) return;
    let mounted = true;
    const filter = contract.filters[EV.Result]();

    async function loadRecent() {
      try {
        const latest = await provider.getBlockNumber();
        const from = latest > 5000 ? latest - 5000 : 0;
        const events = await contract.queryFilter(filter, from, latest);
        if (!mounted) return;
        setRecentResults(
          events
            .filter((ev) => ev.args)
            .slice(-4)
            .reverse()
            .map((ev) => ({
              player: ev.args.player,
              won: ev.args.won,
              txHash: ev.transactionHash,
            }))
        );
      } catch (e) {
        console.error("Error loading recent results:", e);
      }
    }

    loadRecent();
    return () => {
      mounted = false;
    };
  }, [contract, provider]);

  // POPRAWKA: Uproszczony useEffect do ładowania danych użytkownika
  useEffect(() => {
    if (!contract || !provider || !account) return;
    let mounted = true;

    async function loadUserData() {
      try {
        const [pend, last, next, can, blk] = await Promise.all([
          contract[FN.getPendingPrizes](account),
          contract[FN.getUserLastPlayedBlock](account),
          contract[FN.getNextAllowedBlock](account),
          contract[FN.getCanPlay](account),
          provider.getBlockNumber(),
        ]);
        if (!mounted) return;
        setPendingMine(toBigInt(pend));
        setLastPlayedBlock(toBigInt(last));
        setNextAllowedBlock(toBigInt(next));
        setCanPlay(Boolean(can));
        setCurrentBlock(BigInt(blk));
      } catch (e) {
        console.error("Error loading user data:", e);
      }
    }

    loadUserData();
    const iv = setInterval(loadUserData, 3000); // Częstsze odświeżanie
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [contract, provider, account]);

  useEffect(() => {
    if (!contract || !account) {
      setLogLines([]);
      return;
    }
    if (!contract.queryFilter || !contract.filters) {
      setLogLines([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resultLogs = (await contract.queryFilter(contract.filters[EV.Result](account))).map((ev) => ({
          type: "Result",
          ev,
        }));
        const paidLogs = (await contract.queryFilter(contract.filters[EV.PrizePaid](account))).map((ev) => ({
          type: "PrizePaid",
          ev,
        }));
        const pendingLogs = (await contract.queryFilter(contract.filters[EV.PrizePending](account))).map((ev) => ({
          type: "PrizePending",
          ev,
        }));
        const allLogs = [...resultLogs, ...paidLogs, ...pendingLogs]
          .sort((a, b) => Number(b.ev.blockNumber) - Number(a.ev.blockNumber))
          .slice(0, 50)
          .map(({ type, ev }) => {
            if (type === "Result") {
              return {
                text: ev.args.won
                  ? `Result → WIN ${formatEther(ev.args.prize_amount)} ETH`
                  : "Result → Loss",
                txHash: ev.transactionHash,
              };
            }
            if (type === "PrizePaid") {
              return {
                text: `PrizePaid → ${formatEther(ev.args.amount)} ETH`,
                txHash: ev.transactionHash,
              };
            }
            return {
              text: `PrizePending → ${formatEther(ev.args.amount)} ETH`,
              txHash: ev.transactionHash,
            };
          });
        if (!cancelled) setLogLines(allLogs);
      } catch (e) {
        console.error("Error loading logs:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contract, account]);

  async function doPlay() {
    if (!contract || !signer) return;
    try {
      setLoading(true);
      setWonState(null);
      setStatus("");
      setProgressMessage("Drawing in progress...");
      setRejected(false);

      const saltVal = BigInt(salt || "0");
      const txHash = await contract
        .withOptions({ value: feeWei })[FN.play](saltVal);
      addLog({ text: `play(tx: ${shortHash(txHash)})`, txHash });

      const rcpt = await provider.waitForTransaction(txHash);
      
      // POPRAWKA: Natychmiast po transakcji pobierz zaktualizowane dane
      const [newLastPlayed, newNext, newCan, newBlock] = await Promise.all([
          contract[FN.getUserLastPlayedBlock](account),
          contract[FN.getNextAllowedBlock](account),
          contract[FN.getCanPlay](account),
        provider.getBlockNumber()
      ]);

      setLastPlayedBlock(toBigInt(newLastPlayed));
      setNextAllowedBlock(toBigInt(newNext));
      setCanPlay(Boolean(newCan));
      setCurrentBlock(BigInt(newBlock));

      let won = null;
      let prize = 0n;
      if (contract.interface?.parseLog) {
        const receiptLogs = rcpt.logs || rcpt.events || [];
        for (const log of receiptLogs) {
          try {
            const parsed = contract.interface.parseLog(log);
          if (parsed?.name === EV.Result) {
            won = parsed.args.won;
            prize = toBigInt(parsed.args.prize_amount);
            addLog({
                text: parsed.args.won
                  ? `Result → WIN ${formatEther(toBigInt(parsed.args.prize_amount))} ETH`
                  : "Result → Loss",
                txHash: rcpt.transaction_hash || rcpt.transactionHash,
              });
            }
          if (parsed?.name === EV.PrizePaid) {
            addLog({
              text: `PrizePaid → ${formatEther(toBigInt(parsed.args.amount))} ETH`,
              txHash: rcpt.transaction_hash || rcpt.transactionHash,
            });
          }
          if (parsed?.name === EV.PrizePending) {
            addLog({
              text: `PrizePending → ${formatEther(toBigInt(parsed.args.amount))} ETH`,
              txHash: rcpt.transaction_hash || rcpt.transactionHash,
            });
            // Aktualizuj pending prizes
            const newPending = await contract[FN.getPendingPrizes](account);
            setPendingMine(toBigInt(newPending));
          }
          } catch {}
        }
      }

      if (won === true) {
        setWonState(true);
        setStatus("");
      } else if (won === false) {
        setWonState(false);
        setStatus("");
      } else {
        setStatus("Finished. (No Result event decoded)");
      }
    } catch (e) {
      if (e?.code === "ACTION_REJECTED" || /user rejected/i.test(e?.message || "")) {
        setRejected(true);
        setStatus("");
      } else {
        setStatus(e?.shortMessage || e?.message || "Tx failed");
      }
      addLog({ text: `Error: ${e?.shortMessage || e?.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function refreshChainData() {
    if (!provider || !contract || !account) return;
    try {
      const [
        blk,
        next,
        last,
        can,
        pend,
        prize,
        fee,
        chance,
        bal,
      ] = await Promise.all([
        provider.getBlockNumber(),
        contract[FN.getNextAllowedBlock](account),
        contract[FN.getUserLastPlayedBlock](account),
        contract[FN.getCanPlay](account),
        contract[FN.getPendingPrizes](account),
        contract[FN.prizeWei](),
        contract[FN.entryFeeWei](),
        contract[FN.winChancePpm](),
        contract[FN.contractBalance](),
      ]);
      const current = BigInt(blk);
      const nextVal = toBigInt(next);
      const lastVal = toBigInt(last);
      setCurrentBlock(current);
      setNextAllowedBlock(nextVal);
      setLastPlayedBlock(lastVal);
      setCanPlay(Boolean(can));
      setPendingMine(toBigInt(pend));
      setPrizeWei(toBigInt(prize));
      setFeeWei(toBigInt(fee));
      setChancePpm(Number(chance));
      setContractBal(toBigInt(bal));
      if (current >= nextVal) {
        setStatus("New block detected! You can play now.");
      } else {
        setStatus("");
      }
    } catch (e) {
      console.error("Error refreshing chain data:", e);
    }
  }

  async function doClaim() {
    if (!contract) return;
    try {
      setLoading(true);
      const txHash = await contract[FN.claim]();
      addLog({ text: `claim(tx: ${shortHash(txHash)})`, txHash });
      await provider.waitForTransaction(txHash);
      setStatus("Claimed (if any pending)");
      // Odśwież pending prizes
      const newPending = await contract[FN.getPendingPrizes](account);
      setPendingMine(toBigInt(newPending));
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || "Claim failed");
      addLog({ text: `Error: ${e?.shortMessage || e?.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function doFund(amountEth) {
    if (!contract || !signer) return;
    try {
      setLoading(true);
      setWonState(null);
      setStatus("");
      setProgressMessage("Funding in action...");
      setRejected(false);
      const txHash = await contract
        .withOptions({ value: parseEther(amountEth || "0") })[FN.fund]();
      addLog({
        text: `fund ${amountEth} ETH (tx: ${shortHash(txHash)})`,
        txHash,
      });
      await provider.waitForTransaction(txHash);
      setStatus("Funded ✔");
    } catch (e) {
      if (
        e?.code === "ACTION_REJECTED" ||
        /user rejected/i.test(e?.shortMessage || e?.message || "")
      ) {
        setRejected(true);
        setStatus("");
      } else {
        setStatus(e?.shortMessage || e?.message || "Fund failed");
      }
      addLog({ text: `Error: ${e?.shortMessage || e?.message}` });
    } finally {
      setLoading(false);
    }
  }

  const [fundAmt, setFundAmt] = useState("");

  // Owner panel
  const [isOwner, setIsOwner] = useState(false);
  const [pPrize, setPPrize] = useState("0.0001");
  const [pFee, setPFee] = useState("0");
  const [pPct, setPPct] = useState("1");

  useEffect(() => {
    (async () => {
      if (!contract || !account) return;
      try {
        const own = await contract[FN.owner]();
        setIsOwner(own?.toLowerCase?.() === account?.toLowerCase?.());
      } catch {}
    })();
  }, [contract, account]);

  async function applyParams() {
    if (!contract) return;
    try {
      setLoading(true);
      const prize = parseEther(pPrize || "0");
      const fee = parseEther(pFee || "0");
      const ppm = ppmFromPct(pPct || "0");
      const txHash = await contract[FN.setParams](prize, fee, ppm);
      addLog({
        text: `setParams → prize ${pPrize} ETH, fee ${pFee} ETH, chance ${pPct}% (tx: ${shortHash(txHash)})`,
        txHash,
      });
      await provider.waitForTransaction(txHash);
      setStatus("Parameters updated");
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || "setParams failed");
      addLog({ text: `Error: ${e?.shortMessage || e?.message}` });
    } finally {
      setLoading(false);
    }
  }

  const Label = ({ children }) => (
    <span className="text-xs uppercase tracking-wider text-zinc-400">{children}</span>
  );

  const InfoMessage = ({ children }) => (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full text-center px-4 py-2 rounded-xl bg-amber-600/20 border border-amber-500/40 text-amber-300"
    >
      {children}
    </motion.div>
  );

  const LostMessage = () => (
    <motion.div
      key="lose"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full text-center px-4 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300"
    >
      You lost. Better luck next time!
    </motion.div>
  );

  // Debug info - możesz usunąć w produkcji
  useEffect(() => {
    if (account) {
      console.log("Debug info:", {
        account,
        currentBlock: currentBlock.toString(),
        nextAllowedBlock: nextAllowedBlock.toString(),
        canPlay,
        lastPlayedBlock: lastPlayedBlock.toString()
      });
    }
  }, [account, currentBlock, nextAllowedBlock, canPlay, lastPlayedBlock]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-black via-zinc-900 to-black text-zinc-100">
      {/* Top bar */}
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Tubbly logo" className="h-8 w-auto" />
          <div className="font-semibold text-xl">Instant Lottery (Sepolia)</div>
        </div>
        <div className="flex items-center gap-3">
          {account ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-300">{shortAddr(account)}</span>
              <button
                className="px-3 py-1 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700 text-sm"
                onClick={() => navigator.clipboard.writeText(account)}
              >Copy</button>
              <button
                className="px-3 py-1 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700 text-sm"
                onClick={disconnect}
              >Disconnect</button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-semibold shadow"
            >Connect Wallet</button>
          )}
        </div>
      </div>

      {/* Hero panel */}
      <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-extrabold tracking-tight">Spin the Wheel</div>
                <div className="text-zinc-400">One try per address per block – Fair play!</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{formatEther(prizeWei || 0n)} ETH</div>
                <div className="text-zinc-400 text-sm">Current prize</div>
              </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800 p-4">
                <Label>Chance</Label>
                <div className="text-xl font-semibold">{pctFromPpm(chancePpm)}%</div>
              </div>
              <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800 p-4">
                <Label>Entry fee</Label>
                <div className="text-xl font-semibold">{formatEther(feeWei || 0n)} ETH</div>
              </div>
              <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800 p-4">
                <Label>Contract balance</Label>
                <div className="text-xl font-semibold">{formatEther(contractBal || 0n)} ETH</div>
              </div>
            </div>

            <div className="mt-6">
              <Label>User salt</Label>
              <div className="mt-1 flex flex-col sm:flex-row gap-3 items-center">
                <input
                  className="flex-1 w-full px-4 py-3 rounded-2xl bg-black/60 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="e.g. 12345"
                  value={salt}
                  onChange={(e) => setSalt(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  disabled={!account || loading}
                  onClick={doPlay}
                  className={`px-6 py-3 rounded-2xl font-bold text-lg shadow transition ${
                    !account || loading
                      ? "bg-zinc-700 cursor-not-allowed"
                      : "bg-amber-500 hover:bg-amber-400 text-black"
                  }`}
                >
                  {!account ? "Connect wallet to play" : "Play"}
                </button>
              </div>
              <div className="text-xs text-zinc-400 mt-1">Any number. Adds entropy, doesn't change odds.</div>
            </div>

            <div className="mt-4 min-h-[44px] flex items-center gap-3">
              <AnimatePresence>
                {wonState === true && (
                  <motion.div
                    key="win"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full text-center px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300"
                  >You WON! Payout: {formatEther(prizeWei || 0n)} ETH 🎉</motion.div>
                )}
                {wonState === false && <LostMessage />}
                {rejected && (
                  <InfoMessage key="rejected">User rejected action.</InfoMessage>
                )}
                {!loading && !rejected && status && (
                  <InfoMessage key="status">{status}</InfoMessage>
                )}
              </AnimatePresence>
              {loading && wonState === null && (
                <div className="relative w-full bg-zinc-700 rounded-full h-6 overflow-hidden">
                  <div className="progress-bar bg-indigo-400 h-full w-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-indigo-900">{progressMessage}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-lg font-semibold">How it works</div>
                <ul className="mt-3 space-y-3 text-sm text-zinc-300">
                  {[
                    "Connect your wallet.",
                    "Enter any number and press Play.",
                    "You'll see the result in a moment.",
                    "If you win, your ETH prize is sent automatically.",
                    "If not, click Claim.",
                  ].map((step, i) => (
                    <motion.li
                      key={i}
                      className="flex items-center"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.3 }}
                    >
                      <motion.span
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                          delay: i * 0.3 + 0.15,
                          type: "spring",
                          stiffness: 300,
                        }}
                        className="mr-3 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-indigo-900"
                      >
                        {i + 1}
                      </motion.span>
                      <motion.span whileHover={{ x: 4, color: "#fff" }}>{step}</motion.span>
                    </motion.li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-lg font-semibold">Recent winners/losers</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {recentResults.length === 0 && (
                    <li className="text-zinc-400">No plays yet.</li>
                  )}
                  {recentResults.map((r, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2"
                    >
                      <span className="font-mono text-zinc-200">
                        {shortAddr(r.player)}
                      </span>
                      <a
                        href={`https://sepolia.starkscan.co/tx/${r.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <span
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.won
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {r.won ? (
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                          {r.won ? "Won" : "Lost"}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-lg font-semibold">Your wallet</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label>Address</Label>
                <div>{account ? shortAddr(account) : "—"}</div>
              </div>
              <div>
                <Label>Can play now</Label>
                <div className={canPlay ? "text-emerald-400" : "text-zinc-400"}>{canPlay ? "Yes" : "No"}</div>
              </div>
              <div>
                <Label>Last played block</Label>
                <div>{lastPlayedBlock?.toString?.() || "0"}</div>
              </div>
              <div>
                <Label>Current block</Label>
                <div>{currentBlock?.toString?.() || "0"}</div>
              </div>
              <div>
                <Label>Next allowed block</Label>
                <div>{nextAllowedBlock?.toString?.() || "0"}</div>
              </div>
              <div>
                <Label>Your pending prize</Label>
                <div>{formatEther(pendingMine || 0n)} ETH</div>
              </div>
            </div>
            <button
              onClick={doClaim}
              disabled={!account || loading || pendingMine === 0n}
              className={`mt-4 w-full px-4 py-2 rounded-2xl border ${
                pendingMine === 0n ? "bg-zinc-800 text-zinc-400 border-zinc-700" : "bg-emerald-500 text-black border-transparent hover:bg-emerald-400"
              }`}
            >Claim</button>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-lg font-semibold">Fund the pot</div>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 px-4 py-2 rounded-xl bg-black/60 border border-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Amount in ETH (e.g. 0.01)"
                value={fundAmt}
                onChange={(e) => setFundAmt(e.target.value)}
              />
              <button
                onClick={() => doFund(fundAmt || "0")}
                disabled={!account || loading || !fundAmt}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-black font-semibold"
              >Fund</button>
            </div>
            <div className="text-xs text-zinc-400 mt-2">Anyone can fund. ETH stays in the contract.</div>
          </div>

          {isOwner && (
            <div className="rounded-3xl border border-amber-700/40 bg-amber-900/10 p-5">
              <div className="text-lg font-semibold">Owner Panel</div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                <div>
                  <Label>Prize (ETH)</Label>
                  <input className="w-full mt-1 px-3 py-2 rounded-xl bg-black/60 border border-amber-700/40 focus:outline-none" value={pPrize} onChange={(e)=>setPPrize(e.target.value)} />
                </div>
                <div>
                  <Label>Entry fee (ETH)</Label>
                  <input className="w-full mt-1 px-3 py-2 rounded-xl bg-black/60 border border-amber-700/40 focus:outline-none" value={pFee} onChange={(e)=>setPFee(e.target.value)} />
                </div>
                <div>
                  <Label>Chance (%)</Label>
                  <input className="w-full mt-1 px-3 py-2 rounded-xl bg-black/60 border border-amber-700/40 focus:outline-none" value={pPct} onChange={(e)=>setPPct(e.target.value)} />
                </div>
              </div>
              <button
                onClick={applyParams}
                disabled={!account || loading}
                className="mt-4 w-full px-4 py-2 rounded-2xl bg-amber-500 text-black font-bold hover:bg-amber-400"
              >Update Parameters</button>
              <div className="text-xs text-amber-200/70 mt-2">Reminder: on-chain RNG is manipulable; keep prizes small on mainnet.</div>
            </div>
          )}

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-lg font-semibold">Activity</div>
            <div className="mt-2 space-y-1 text-sm max-h-60 overflow-auto">
              {logLines.length === 0 && <div className="text-zinc-400">No activity yet.</div>}
              {logLines.map((l, idx) => (
                <div key={idx} className="text-zinc-300">
                  • {l.txHash ? (
                    <a
                      href={`https://sepolia.starkscan.co/tx/${l.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {l.text}
                    </a>
                  ) : (
                    l.text
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mx-auto max-w-6xl px-4 py-10 text-xs text-zinc-500">
        <div>
          <span className="font-semibold text-zinc-300">Disclaimer:</span> The lottery is free – just connect your wallet to join. No hidden costs, just a chance to win big!
        </div>
        <div className="mt-1">Contract: {CONTRACT_ADDRESS}</div>
      </div>
    </div>
  );
}
