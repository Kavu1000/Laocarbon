import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("LaoCarbon", (m) => {
  const admin = m.getAccount(0);
  const platformWallet = m.getParameter("platformWallet", admin);
  const governmentWallet = m.getParameter("governmentWallet", admin);

  const usdt = m.contract("MockUSDT");
  const token = m.contract("LaoCarbonToken", [admin]);
  const certificate = m.contract("LaoCarbonCertificate", [admin]);
  const marketplace = m.contract("LaoCarbonMarketplace", [
    admin,
    usdt,
    token,
    certificate,
    platformWallet,
    governmentWallet,
  ]);

  const minterRole = m.staticCall(certificate, "MINTER_ROLE");
  m.call(certificate, "grantRole", [minterRole, marketplace]);

  return { usdt, token, certificate, marketplace };
});
