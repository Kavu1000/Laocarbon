import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const PROJECT_ID = 1n;
const IPFS = "bafybeigdyrztnamhaforest";
const PRICE = 7_500_000n; // $7.50 per tCO2e, 6 decimals
const LISTED = 1_000n;

describe("LaoCarbonMarketplace", () => {
  async function deploy() {
    const [admin, owner, auditor, platform, government, buyer, other] = await ethers.getSigners();

    const usdt = await ethers.deployContract("MockUSDT");
    const token = await ethers.deployContract("LaoCarbonToken", [admin]);
    const cert = await ethers.deployContract("LaoCarbonCertificate", [admin]);
    const market = await ethers.deployContract("LaoCarbonMarketplace", [admin, usdt, token, cert, platform, government]);
    await cert.grantRole(await cert.MINTER_ROLE(), market);

    await market.registerProject(PROJECT_ID, owner, auditor, IPFS);
    await token.mint(owner, LISTED);
    await token.connect(owner).approve(market, LISTED);
    await market.connect(owner).createListing(PROJECT_ID, PRICE, LISTED);

    await usdt.mint(buyer, 1_000_000n * 10n ** 6n);
    return { admin, owner, auditor, platform, government, buyer, other, usdt, token, cert, market };
  }

  async function buy(f: Awaited<ReturnType<typeof deploy>>, tons: bigint) {
    const cost = await f.market.quote(1, tons);
    await f.usdt.connect(f.buyer).approve(f.market, cost);
    return f.market.connect(f.buyer).buyAndOffset(1, tons, cost);
  }

  it("escrows listed credits in the marketplace", async () => {
    const { token, market, owner } = await loadFixture(deploy);
    expect(await token.balanceOf(market)).to.equal(LISTED);
    expect(await token.balanceOf(owner)).to.equal(0);
  });

  it("splits revenue 87/5/5/3", async () => {
    const f = await loadFixture(deploy);
    const tons = 100n;
    const total = PRICE * tons; // 750 USDT
    await expect(buy(f, tons)).to.changeTokenBalances(
      f.usdt,
      [f.buyer, f.owner, f.platform, f.auditor, f.government, f.market],
      [-total, (total * 87n) / 100n, (total * 5n) / 100n, (total * 5n) / 100n, (total * 3n) / 100n, 0n],
    );
  });

  it("sends rounding dust to the forest owner and leaves nothing in the contract", async () => {
    const f = await loadFixture(deploy);
    await f.market.registerProject(2, f.owner, f.auditor, IPFS);
    await f.token.mint(f.owner, 1);
    await f.token.connect(f.owner).approve(f.market, 1);
    await f.market.connect(f.owner).createListing(2, 33, 1); // 33 base units: 5% / 3% round down

    await f.usdt.connect(f.buyer).approve(f.market, 33);
    await expect(f.market.connect(f.buyer).buyAndOffset(2, 1, 33)).to.changeTokenBalances(
      f.usdt,
      [f.owner, f.platform, f.auditor, f.government, f.market],
      [33n - 1n - 1n - 0n, 1n, 1n, 0n, 0n],
    );
  });

  it("burns the credits to 0x0 and reduces total supply", async () => {
    const f = await loadFixture(deploy);
    await expect(buy(f, 40n))
      .to.emit(f.token, "Transfer")
      .withArgs(await f.market.getAddress(), ethers.ZeroAddress, 40n);
    expect(await f.token.totalSupply()).to.equal(LISTED - 40n);
    expect(await f.token.balanceOf(f.buyer)).to.equal(0);
    expect((await f.market.listings(1)).available).to.equal(LISTED - 40n);
  });

  it("emits CarbonOffset with buyer, project, amount, IPFS hash and timestamp", async () => {
    const f = await loadFixture(deploy);
    const cost = PRICE * 25n;
    await f.usdt.connect(f.buyer).approve(f.market, cost);
    const ts = (await time.latest()) + 100;
    await time.setNextBlockTimestamp(ts);
    await expect(f.market.connect(f.buyer).buyAndOffset(1, 25n, cost))
      .to.emit(f.market, "CarbonOffset")
      .withArgs(1n, f.buyer.address, PROJECT_ID, 1n, 25n, PRICE * 25n, IPFS, ts);
  });

  it("mints a soulbound certificate to the buyer", async () => {
    const f = await loadFixture(deploy);
    await buy(f, 25n);
    expect(await f.cert.ownerOf(1)).to.equal(f.buyer.address);
    expect(await f.cert.locked(1)).to.equal(true);

    const r = await f.cert.retirement(1);
    expect(r.beneficiary).to.equal(f.buyer.address);
    expect(r.tons).to.equal(25n);
    expect(r.projectIpfsHash).to.equal(IPFS);

    const json = JSON.parse(Buffer.from((await f.cert.tokenURI(1)).split(",")[1], "base64").toString());
    expect(json.name).to.equal("Carbon Retirement Certificate #1");

    await expect(
      f.cert.connect(f.buyer).transferFrom(f.buyer, f.other, 1),
    ).to.be.revertedWithCustomError(f.cert, "Soulbound");
  });

  it("is atomic: a failed payment leaves credits unburned and no certificate", async () => {
    const f = await loadFixture(deploy);
    const cost = await f.market.quote(1, 10n);
    await f.usdt.connect(f.buyer).approve(f.market, cost - 1n);
    await expect(f.market.connect(f.buyer).buyAndOffset(1, 10n, cost)).to.be.reverted;
    expect(await f.token.totalSupply()).to.equal(LISTED);
    expect(await f.cert.totalMinted()).to.equal(0);
  });

  it("rejects buying more than is listed, zero amounts, and price above max", async () => {
    const f = await loadFixture(deploy);
    await expect(f.market.connect(f.buyer).buyAndOffset(1, LISTED + 1n, ethers.MaxUint256))
      .to.be.revertedWithCustomError(f.market, "InsufficientCredits");
    await expect(f.market.connect(f.buyer).buyAndOffset(1, 0, 0))
      .to.be.revertedWithCustomError(f.market, "ZeroAmount");
    await expect(f.market.connect(f.buyer).buyAndOffset(1, 10n, PRICE * 10n - 1n))
      .to.be.revertedWithCustomError(f.market, "PriceExceedsMax");
  });

  it("only lets the registered forest owner list, and only the seller cancel", async () => {
    const f = await loadFixture(deploy);
    await expect(f.market.connect(f.other).createListing(PROJECT_ID, PRICE, 1))
      .to.be.revertedWithCustomError(f.market, "NotForestOwner");
    await expect(f.market.connect(f.owner).createListing(99, PRICE, 1))
      .to.be.revertedWithCustomError(f.market, "UnknownProject");
    await expect(f.market.connect(f.other).cancelListing(1))
      .to.be.revertedWithCustomError(f.market, "NotSeller");

    await buy(f, 100n);
    await expect(f.market.connect(f.owner).cancelListing(1))
      .to.changeTokenBalances(f.token, [f.owner, f.market], [LISTED - 100n, -(LISTED - 100n)]);
  });

  describe("retire (burn held credits)", () => {
    async function withHeldCredits() {
      const f = await loadFixture(deploy);
      await f.token.mint(f.owner, 500n);
      return f;
    }

    it("burns from the holder, mints a certificate and emits CarbonOffset with listing 0", async () => {
      const f = await withHeldCredits();
      await f.token.connect(f.owner).approve(f.market, 200n);
      const supply = await f.token.totalSupply();
      await expect(f.market.connect(f.owner).retire(PROJECT_ID, 200n))
        .to.emit(f.token, "Transfer").withArgs(f.owner.address, ethers.ZeroAddress, 200n)
        .and.to.emit(f.market, "CarbonOffset");
      expect(await f.token.balanceOf(f.owner)).to.equal(300n);
      expect(await f.token.totalSupply()).to.equal(supply - 200n);
      expect(await f.cert.ownerOf(1)).to.equal(f.owner.address);
      const r = await f.cert.retirement(1);
      expect(r.tons).to.equal(200n);
      expect(r.projectId).to.equal(PROJECT_ID);
    });

    it("requires approval, a registered project, its forest owner and a non-zero amount", async () => {
      const f = await withHeldCredits();
      await expect(f.market.connect(f.owner).retire(PROJECT_ID, 10n)).to.be.revertedWithCustomError(f.token, "ERC20InsufficientAllowance");
      await f.token.connect(f.owner).approve(f.market, 10n);
      await expect(f.market.connect(f.owner).retire(99, 10n)).to.be.revertedWithCustomError(f.market, "UnknownProject");
      await expect(f.market.connect(f.owner).retire(PROJECT_ID, 0)).to.be.revertedWithCustomError(f.market, "ZeroAmount");
      await f.token.mint(f.other, 10n);
      await f.token.connect(f.other).approve(f.market, 10n);
      await expect(f.market.connect(f.other).retire(PROJECT_ID, 10n)).to.be.revertedWithCustomError(f.market, "NotForestOwner");
    });
  });

  it("restricts certificate minting to the marketplace", async () => {
    const f = await loadFixture(deploy);
    await expect(f.cert.connect(f.buyer).mint(f.buyer, 1, 1, IPFS))
      .to.be.revertedWithCustomError(f.cert, "AccessControlUnauthorizedAccount");
  });
});
