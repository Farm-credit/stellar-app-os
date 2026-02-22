import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { network?: string };
    const network = body.network || "testnet";

    const keypair = generateKeypair();
    
    return NextResponse.json({
      publicKey: keypair.publicKey,
      network,
    });
  } catch (error) {
    console.error("Error creating custodial wallet:", error);
    return NextResponse.json(
      { error: "Failed to create custodial wallet" },
      { status: 500 }
    );
  }
}

function generateKeypair(): { publicKey: string; secretKey: string } {
  const secret = randomBytes(32);
  const secretKey = secret.toString("hex");
  
  const publicKey = "G" + secretKey.slice(0, 55).toUpperCase();
  
  return {
    publicKey,
    secretKey,
  };
}
