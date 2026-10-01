import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

// Hedera networks run the real HSS at 0x16b; everywhere else we wire the mock
// (HSS does not exist on a local Hardhat node - RESEARCH.md section 4).
const deployScheduleMock: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (chainId === 295 || chainId === 296) return;

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("MockScheduleService", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    gasLimit: "2000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployScheduleMock.tags = ["ScheduleMock"];
export default deployScheduleMock;
