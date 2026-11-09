import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PharmaChainModule", (m) => {
  const pharma = m.contract("PharmaChain");
  return { pharma };
});