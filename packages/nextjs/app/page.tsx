"use client";

import Image from "next/image";
import Link from "next/link";
import type { NextPage } from "next";
import { BugAntIcon } from "@heroicons/react/24/outline";
import { CommitteeList } from "~~/components/committee/CommitteeList";
import { CreateCommitteeCard } from "~~/components/committee/CreateCommitteeCard";
import { OraclePriceChip } from "~~/components/committee/OraclePriceChip";

const Home: NextPage = () => {
  return (
    <>
      <div className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal w-full py-12 px-5">
        <div className="flex flex-col items-center max-w-3xl mx-auto gap-4 text-center">
          <Image src="/Hedera-Icon-White.svg" alt="Hedera icon" width={56} height={56} className="hidden dark:block" />
          <Image src="/Hedera-Icon-Dark.svg" alt="Hedera icon" width={56} height={56} className="dark:hidden" />
          <h1 className="text-3xl font-bold text-white m-0">USD-Fixed Committees on Hedera</h1>
          <p className="text-white/80 m-0 max-w-2xl">
            A digital ROSCA (savings circle): every member owes a fixed dollar amount per round, paid in HBAR at the
            live oracle price. HBAR can swing wildly - what members owe each other does not.
          </p>
          <OraclePriceChip />
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-5 py-10 flex flex-col gap-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <CreateCommitteeCard />

          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3">
              <h2 className="card-title">How it works</h2>
              <ol className="list-decimal list-inside text-sm text-base-content/80 flex flex-col gap-2 m-0">
                <li>
                  A creator opens a committee: fixed <strong>USD</strong> per round, 2-10 members, round length.
                </li>
                <li>
                  Members join in order - join order is the payout order. The round starts when the last slot fills.
                </li>
                <li>
                  Each round every member sends exactly that USD amount in HBAR. The contract converts USD to HBAR
                  through the <strong>Chainlink HBAR/USD feed</strong> at that moment; overpayments are refunded in the
                  same transaction. <strong>No oracle - no contribution.</strong>
                </li>
                <li>
                  At round end the whole pot goes to one member (round-robin). The payout is scheduled on the Hedera
                  Schedule Service; anyone can finalize manually if scheduling fails.
                </li>
                <li>Repeat until everyone has been paid once. The creator sweeps the leftover HSS fee reserve.</li>
              </ol>
              <p className="text-xs text-base-content/60 m-0">
                Every event is appended to an HCS topic as a tamper-evident audit log (see each committee&apos;s audit
                trail).
              </p>
            </div>
          </div>
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold m-0">Open committees</h2>
            <Link href="/debug" className="btn btn-ghost btn-sm">
              <BugAntIcon className="h-4 w-4" />
              Debug Contracts
            </Link>
          </div>
          <CommitteeList />
        </section>
      </div>
    </>
  );
};

export default Home;
