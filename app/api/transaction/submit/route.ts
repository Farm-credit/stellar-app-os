import { NextResponse } from "next/server";
import { submitTransaction } from "@/lib/stellar/transaction";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      signedTransactionXdr: string;
      network: "testnet" | "mainnet";
    };

    const { signedTransactionXdr, network } = body;

    if (!signedTransactionXdr || !network) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const transactionHash = await submitTransaction(signedTransactionXdr, network);

    return NextResponse.json({ transactionHash });
  } catch (error) {
    console.error("Error submitting transaction:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to submit transaction";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
