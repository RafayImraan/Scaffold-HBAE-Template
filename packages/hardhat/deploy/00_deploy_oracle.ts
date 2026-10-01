import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

// Chainlink HBAR/USD Data Feed addresses (RESEARCH.md section 3), 8 decimals on both networks.
const HBAR_USD_FEED: Record<number, string> = {
  296: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
  295: "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5",
};

// Global staleness bound for the adapter; each committee enforces its own
// tighter maxPriceAge (factory bounds it to at most 7 days).
const ADAPTER_MAX_PRICE_AGE = 7 * 24 * 60 * 60;

// Local dev price: $0.10 per HBAR.
const MOCK_START_PRICE_E18 = 10n ** 17n;

const deployOracle: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const gasPrice = await getDeployGasPrice(hre);

  const feed = HBAR_USD_FEED[chainId];
  if (feed) {
    await deploy("ChainlinkHbarUsdAdapter", {
      from: deployer,
      args: [feed, ADAPTER_MAX_PRICE_AGE],
      log: true,
      autoMine: true,
      gasLimit: "1500000",
      gasPrice,
    });
    return;
  }

  await deploy("MockPriceOracle", {
    from: deployer,
    args: [MOCK_START_PRICE_E18],
    log: true,
    autoMine: true,
    gasLimit: "1500000",
    gasPrice,
  });
};

deployOracle.tags = ["Oracle"];
export default deployOracle;
