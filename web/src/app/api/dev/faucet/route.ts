import { NextResponse } from "next/server";
import { createPublicClient, encodeFunctionData, getAddress, http, isAddress, parseEther, parseUnits, toHex } from "viem";
import { deployments, MockUSDTAbi } from "@/lib/contracts.generated";

// Local Hardhat chain only: gives a fresh MetaMask wallet gas ETH and test USDT without it needing
// any ETH to sign a transaction first. Uses the node's unlocked dev account, so it can't work on a real network.

const LOCAL_CHAIN_ID = 31337;
const ETH_TOPUP = parseEther("10");
const USDT_AMOUNT = parseUnits("10000", 6);

export async function POST(req: Request) {
  const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL;
  if (!rpcUrl || (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_FAUCET !== "true")) {
    return NextResponse.json({ error: "Faucet disabled" }, { status: 404 });
  }
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  const to = getAddress(address);

  const client = createPublicClient({ transport: http(rpcUrl) });
  if ((await client.getChainId()) !== LOCAL_CHAIN_ID) return NextResponse.json({ error: "Not a local chain" }, { status: 400 });
  const usdt = deployments[LOCAL_CHAIN_ID]?.MockUSDT;
  if (!usdt) return NextResponse.json({ error: "Contracts not deployed" }, { status: 503 });

  const rpc = (method: string, params: unknown[]) => client.request({ method, params } as never);

  if ((await client.getBalance({ address: to })) < parseEther("1")) {
    await rpc("hardhat_setBalance", [to, toHex(ETH_TOPUP)]);
  }
  const [funder] = (await rpc("eth_accounts", [])) as `0x${string}`[];
  const hash = (await rpc("eth_sendTransaction", [
    { from: funder, to: usdt, data: encodeFunctionData({ abi: MockUSDTAbi, functionName: "mint", args: [to, USDT_AMOUNT] }) },
  ])) as `0x${string}`;
  await client.waitForTransactionReceipt({ hash });

  return NextResponse.json({ ok: true, eth: (await client.getBalance({ address: to })).toString(), usdtMinted: USDT_AMOUNT.toString() });
}
