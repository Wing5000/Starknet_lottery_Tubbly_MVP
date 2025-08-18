# Lucky Block — Instant Lottery (Sepolia)

Casino-style dApp UI for the `BlockInstantLottery` contract.

- Connect [Braavos](https://braavos.app/) StarkNet wallet (Sepolia)
- Play (1 try / address / block), instant result
- Claim pending prizes, fund the pot
- Owner panel to update params

## Quick start

```bash
npm i
npm run dev
```

Open http://localhost:5173 and connect your Braavos wallet (StarkNet Sepolia).

## Build

```bash
npm run build
```

The static site is in `dist/` — perfect for Vercel/Netlify.

## Configure

- Contract address is set in `src/App.jsx` (`CONTRACT_ADDRESS`).
- Uses ethers v6. RNG uses block data (not secure for big prizes).

## How it works

- Open the site and connect your Braavos wallet on the StarkNet Sepolia testnet.
- Click **Play** to try your luck.
- The app instantly tells you if you won or lost.
- If you win, click **Claim** to receive your prize.
- Anyone can add more ETH to the pot, and the owner can change game settings.
