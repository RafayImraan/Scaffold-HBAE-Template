import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

// HIP-1215 Hedera Schedule Service system contract.
const HSS_SYSTEM_CONTRACT = "0x000000000000000000000000000000000000016B";

const deployFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);

  // Chain-id-derived native units (measured, RESEARCH.md section 9):
  // Hedera (296/295) counts tinybars (1e8 per HBAR), local Hardhat counts wei (1e18).
  const isHedera = chainId === 295 || chainId === 296;
  const unitsPerHbar = isHedera ? 10n ** 8n : 10n ** 18n;

  const oracle = await get(isHedera ? "ChainlinkHbarUsdAdapter" : "MockPriceOracle");
  const scheduleService = isHedera ? HSS_SYSTEM_CONTRACT : (await get("MockScheduleService")).address;
  const hssEnabled = isHedera;

  await deploy("CommitteeFactory", {
    from: deployer,
    args: [oracle.address, scheduleService, hssEnabled, unitsPerHbar],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });

  console.log(`  unitsPerHbar = ${unitsPerHbar} (chainId ${chainId})`);
  console.log(`  hssEnabled = ${hssEnabled}`);
};

deployFactory.tags = ["CommitteeFactory"];
deployFactory.dependencies = ["Oracle", "ScheduleMock"];
export default deployFactory;
