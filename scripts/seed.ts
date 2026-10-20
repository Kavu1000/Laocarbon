import { readFileSync } from "node:fs";
import { ethers, network } from "hardhat";

// Mirrors the verified projects in web/src/lib/projects.ts. ipfsHash values are placeholders until Pinata is wired up.
const LISTINGS = [
  { projectId: 1, ownerIndex: 1, ipfsHash: "bafkreinamhaforestconservationpdd", price: "7.50", tons: 120_000 },
  { projectId: 2, ownerIndex: 2, ipfsHash: "bafkreiphoukhaoreforestationpdd", price: "9.00", tons: 85_000 },
  { projectId: 3, ownerIndex: 3, ipfsHash: "bafkreixepianrestorationpdd", price: "8.25", tons: 300_000 },
];

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const deployed: Record<string, string> = JSON.parse(
    readFileSync(`ignition/deployments/chain-${chainId}/deployed_addresses.json`, "utf8"),
  );
  const signers = await ethers.getSigners();
  const [admin] = signers;
  const auditor = signers[4];

  const usdt = await ethers.getContractAt("MockUSDT", deployed["LaoCarbon#MockUSDT"]);
  const token = await ethers.getContractAt("LaoCarbonToken", deployed["LaoCarbon#LaoCarbonToken"]);
  const market = await ethers.getContractAt("LaoCarbonMarketplace", deployed["LaoCarbon#LaoCarbonMarketplace"]);

  await (await market.setWallets(signers[5], signers[6])).wait();

  for (const l of LISTINGS) {
    const owner = signers[l.ownerIndex];
    if ((await market.projects(l.projectId)).registered) continue;
    await (await market.registerProject(l.projectId, owner, auditor, l.ipfsHash)).wait();
    await (await token.mint(owner, l.tons)).wait();
    await (await token.connect(owner).approve(market, l.tons)).wait();
    await (await market.connect(owner).createListing(l.projectId, ethers.parseUnits(l.price, 6), l.tons)).wait();
    console.log(`Listed project ${l.projectId}: ${l.tons} tCO2e @ $${l.price}`);
  }

  for (const buyer of signers.slice(7, 10)) {
    await (await usdt.mint(buyer, ethers.parseUnits("5000000", 6))).wait();
  }

  console.log(`\nSeeded ${network.name}`);
  console.log(`  admin / registrar : ${admin.address}  (account #0)`);
  console.log(`  forest owners     : accounts #1-#3`);
  console.log(`  auditor           : ${auditor.address}  (account #4)`);
  console.log(`  platform / gov    : accounts #5 / #6`);
  console.log(`  buyers (5M USDT)  : accounts #7-#9`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
