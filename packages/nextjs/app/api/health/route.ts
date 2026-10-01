import { NextResponse } from "next/server";
import deployedContracts from "~~/contracts/deployedContracts";
import scaffoldConfig from "~~/scaffold.config";
import { loadRootEnv } from "~~/utils/loadRootEnv";

export const dynamic = "force-dynamic";

export async function GET() {
  loadRootEnv();
  const chainId = scaffoldConfig.targetNetworks[0].id;
  const deployments = (deployedContracts as unknown as Record<string, Record<string, { address: string }>>)[
    String(chainId)
  ];
  const factory = deployments?.CommitteeFactory?.address ?? null;
  const hcsTopicId = process.env.HCS_TOPIC_ID || null;

  return NextResponse.json({ ok: true, chainId, factory, hcsTopicId });
}
