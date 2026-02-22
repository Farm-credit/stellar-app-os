import { NextResponse } from "next/server";
import { buildPaymentTransaction } from "@/lib/stellar/transaction";
import type { BuildTransactionRequest } from "@/lib/types/payment";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildTransactionRequest;
    const { selection, walletPublicKey, network, idempotencyKey } = body;

    if (!selection.projectId || selection.quantity <= 0 || selection.calculatedPrice <= 0) {
      return NextResponse.json(
        { error: "Invalid selection" },
        { status: 400 }
      );
    }

    if (!walletPublicKey || !network || !idempotencyKey) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const result = await buildPaymentTransaction(
      selection,
      walletPublicKey,
      network,
      idempotencyKey
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error building transaction:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to build transaction";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
