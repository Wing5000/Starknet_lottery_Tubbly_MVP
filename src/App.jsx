import React, { useMemo, useState } from "react";
import { sepolia } from "@starknet-react/chains";
import {
  StarknetConfig,
  publicProvider,
  voyager,
  useInjectedConnectors,
  braavos,
  ready,
  useAccount,
  useConnect,
  useDisconnect,
  useNetwork,
  useSwitchChain,
  useSendTransaction,
} from "@starknet-react/core";

// ===== Konfiguracja przez .env =====
// Ustaw to w pliku .env (patrz sekcja 3)
const CONTRACT_ADDRESS =
  import.meta?.env?.VITE_CONTRACT_ADDRESS || "0x75d13ac0cb15587532e4c1a208d3ffddf97fb60c35c7be3b891388054def324";

// Domyślne nazwy entrypointów — możesz nadpisać w .env
const ENTRYPOINT_PLAY =
  import.meta?.env?.VITE_ENTRYPOINT_PLAY || "play";
const ENTRYPOINT_CLAIM =
  import.meta?.env?.VITE_ENTRYPOINT_CLAIM || "claim";

function StarknetProviderInline({ children }) {
  // Pokaż Braavos + Ready (Argent) — automatycznie wykrywane z przeglądarki
  const { connectors } = useInjectedConnectors({
    recommended: [ready(), braavos()],
    includeRecommended: "onlyIfNoConnectors",
    order: "random",
  });

  return (
    <StarknetConfig
      chains={[sepolia]}
      provider={publicProvider()}
      connectors={connectors}
      explorer={voyager}
    >
      {children}
    </StarknetConfig>
  );
}

function shorten(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function ConnectBar() {
  const { address, isConnected, status } = useAccount();
  const { chain } = useNetwork();
  const { switchChain, isPending: switching } = useSwitchChain();

  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();

  const onConnect = async (connector) => {
    try {
      await connect({ connector });
    } catch (e) {
      console.error(e);
      alert(e?.message ?? "Failed to connect");
    }
  };

  const needsSepolia =
    chain?.name?.toLowerCase().includes("sepolia") === false;

  return (
    <div className="w-full rounded-2xl border border-gray-200 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">Wallet</div>
        {!isConnected ? (
          <div className="flex gap-2">
            {connectors.map((c) => (
              <button
                key={c.id()}
                onClick={() => onConnect(c)}
                disabled={connecting}
                className="px-3 py-2 rounded-xl border hover:bg-gray-50"
              >
                {connecting ? "Connecting…" : `Connect ${c.id()}`}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => disconnect()}
            className="px-3 py-2 rounded-xl border hover:bg-gray-50"
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="mt-3 text-sm text-gray-700 space-y-1">
        <div>Status: <span className="font-medium">{status}</span></div>
        <div>Address: <span className="font-mono">{isConnected ? shorten(address) : "—"}</span></div>
        <div>
          Network: <span className="font-medium">{chain?.name ?? "—"}</span>
          {isConnected && chain && needsSepolia && (
            <button
              onClick={() => switchChain({ chain: sepolia })}
              disabled={switching}
              className="ml-2 px-2 py-1 text-xs rounded-lg border hover:bg-gray-50"
            >
              {switching ? "Switching…" : "Switch to Sepolia"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function useVoyagerTxLink() {
  const { chain } = useNetwork();
  return useMemo(() => {
    const isSepolia = chain?.name?.toLowerCase().includes("sepolia");
    const base = isSepolia
      ? "https://sepolia.voyager.online/tx/"
      : "https://voyager.online/tx/";
    return (hash) => `${base}${hash}`;
  }, [chain]);
}

function ActionsPanel() {
  const { isConnected } = useAccount();
  const voyagerTx = useVoyagerTxLink();

  const [lastTx, setLastTx] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const { send: sendTx, isPending } = useSendTransaction();

  const doPlay = async () => {
    setErrorMsg("");
    try {
      const res = await sendTx({
        calls: [
          {
            contractAddress: CONTRACT_ADDRESS,
            entrypoint: ENTRYPOINT_PLAY,
            calldata: [],
          },
        ],
      });
      if (res?.transaction_hash) setLastTx(res.transaction_hash);
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.message ?? "Transaction failed");
    }
  };

  const doClaim = async () => {
    setErrorMsg("");
    try {
      const res = await sendTx({
        calls: [
          {
            contractAddress: CONTRACT_ADDRESS,
            entrypoint: ENTRYPOINT_CLAIM,
            calldata: [],
          },
        ],
      });
      if (res?.transaction_hash) setLastTx(res.transaction_hash);
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.message ?? "Transaction failed");
    }
  };

  return (
    <div className="w-full rounded-2xl border border-gray-200 p-4 shadow-sm">
      <div className="font-semibold mb-2">🎲 Lottery (Starknet Sepolia)</div>

      <div className="text-sm text-gray-700">
        <div className="mb-2">
          Contract:{" "}
          <span className="font-mono">{CONTRACT_ADDRESS || "— not set"}</span>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          <button
            onClick={doPlay}
            disabled={!isConnected || isPending || !CONTRACT_ADDRESS}
            className="px-4 py-2 rounded-xl border hover:bg-gray-50 disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Play"}
          </button>

          <button
            onClick={doClaim}
            disabled={!isConnected || isPending || !CONTRACT_ADDRESS}
            className="px-4 py-2 rounded-xl border hover:bg-gray-50 disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Claim"}
          </button>
        </div>

        {lastTx && (
          <div className="mt-3 text-xs">
            TX:{" "}
            <a
              href={voyagerTx(lastTx)}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline break-all"
            >
              {lastTx}
            </a>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 text-xs text-red-600">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StarknetProviderInline>
      <main className="min-h-screen bg-white text-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
          <h1 className="text-2xl font-bold">Lucky Block — Starknet (Sepolia)</h1>
          <ConnectBar />
          <ActionsPanel />
          <p className="text-xs text-gray-500">
            Tip: nazwy entrypointów możesz nadpisać przez <code>.env</code> (patrz niżej).
          </p>
        </div>
      </main>
    </StarknetProviderInline>
  );
}
