import { readFileSync } from "node:fs";
import { ethers } from "hardhat";

// Demo activity for the marketplace: several buyer wallets offset credits from the seeded listings.
// Run after seed.ts: npx hardhat run scripts/demo-purchases.ts --network localhost
const PURCHASES: [signerIndex: number, listingId: number, tons: number][] = [
  [8, 1, 12_000], [9, 1, 8_500], [11, 1, 5_000], [12, 1, 3_200], [13, 1, 2_100], [14, 1, 900],
  [8, 2, 15_000], [11, 2, 6_000],
  [9, 3, 40_000], [12, 3, 25_000], [13, 3, 10_000],
];

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const deployed: Record<string, string> = JSON.parse(
    readFileSync(`ignition/deployments/chain-${chainId}/deployed_addresses.json`, "utf8"),
  );
  const signers = await ethers.getSigners();
  const usdt = await ethers.getContractAt("MockUSDT", deployed["LaoCarbon#MockUSDT"]);
  const market = await ethers.getContractAt("LaoCarbonMarketplace", deployed["LaoCarbon#LaoCarbonMarketplace"]);

  for (const [i, listingId, tons] of PURCHASES) {
    const buyer = signers[i];
    const cost = await market.quote(listingId, tons);
    if ((await usdt.balanceOf(buyer)) < cost) await (await usdt.mint(buyer, cost)).wait();
    await (await usdt.connect(buyer).approve(market, cost)).wait();
    await (await market.connect(buyer).buyAndOffset(listingId, tons, cost)).wait();
    console.log(`account #${i} offset ${tons} tCO2e from listing ${listingId}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
