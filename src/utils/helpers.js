import { cairo } from 'starknet';

export function formatEther(wei) {
  if (!wei) return "0";
  try {
    const weiStr = wei.toString();
    const eth = Number(weiStr) / 1e18;
    return eth.toFixed(6);
  } catch {
    return "0";
  }
}

export function parseEther(eth) {
  try {
    const ethNum = parseFloat(eth || "0");
    return cairo.uint256(BigInt(Math.floor(ethNum * 1e18)));
  } catch {
    return cairo.uint256(0n);
  }
}

export function pctFromPpm(ppm) {
  return Number(ppm) / 10000;
}

export function ppmFromPct(pct) {
  return Math.round(parseFloat(String(pct)) * 10000);
}

export function toBigInt(value) {
  if (!value) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  if (typeof value === "number") return BigInt(value);
  return 0n;
}

export function shortAddr(address) {
  if (!address) return "";
  const s = String(address);
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
