# Lucky Block — Instant Lottery (Starknet)

Casino-style dApp UI for the `BlockInstantLottery` contract deployed on Starknet.

- Connect [Braavos](https://braavos.app/) or [Argent X](https://www.argent.xyz/argent-x/) wallet
- Play (1 try / address / block), instant result
- Claim pending prizes, fund the pot
- Owner panel to update params

## Quick start

```bash
npm install
npm run dev
```

Create a `.env` file based on `.env.example` and set `VITE_CONTRACT_ADDRESS` to your deployed contract address. Open http://localhost:5173 and connect your wallet.

## Build

```bash
npm run build
```

The static site is in `dist/` — perfect for Vercel/Netlify.

## Configure

- Contract address comes from `VITE_CONTRACT_ADDRESS` in `.env`.
- Uses [`starknet.js`](https://github.com/starknet-io/starknet.js) v6 and [`@argent/get-starknet`](https://github.com/argentlabs/argent-js/tree/master/packages/get-starknet).
- RNG uses block data (not secure for big prizes).

## How it works

- Open the site and connect your wallet on the Starknet Sepolia testnet.
- Click **Play** to try your luck.
- The app instantly tells you if you won or lost.
- If you win, click **Claim** to receive your prize.
- Anyone can add more ETH to the pot, and the owner can change game settings.
