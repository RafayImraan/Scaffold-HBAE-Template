import * as fs from "fs";
import prettier from "prettier";

/**
 * Writes the Committee ABI to the frontend (packages/nextjs/contracts/committeeAbi.ts).
 *
 * Committee instances are created by the factory at runtime, so hardhat-deploy never
 * records them in deployments/ and generateTsAbis cannot cover them. The frontend needs
 * the ABI to read/write any committee at its address; the file is committed so a fresh
 * clone can build before any deploy. Regenerate after contract changes:
 *
 *   npm run hardhat:compile -- && npm run hardhat:abi:export --
 */
const ARTIFACT = "./artifacts/contracts/Committee.sol/Committee.json";
const TARGET = "../nextjs/contracts/committeeAbi.ts";

async function main() {
  if (!fs.existsSync(ARTIFACT)) {
    throw new Error(`Missing ${ARTIFACT} - run npm run hardhat:compile -- first`);
  }
  const { abi } = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as { abi: unknown[] };
  const banner = `/**
 * Committee ABI - generated from the Committee artifact by
 * \`npm run hardhat:abi:export --\`. Do not edit by hand; re-run the script
 * after changing the contract.
 */
`;
  const body = `${banner}export const committeeAbi = ${JSON.stringify(abi, null, 2)} as const;\n\nexport default committeeAbi;\n`;
  const formatted = await prettier.format(body, { parser: "typescript" });
  fs.writeFileSync(TARGET, formatted);
  console.log(`Committee ABI written to ${TARGET}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
