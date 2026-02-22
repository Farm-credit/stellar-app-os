import type { NetworkType } from "@/lib/types/wallet";
import { Networks } from "@stellar/stellar-sdk";

export async function signTransactionWithFreighter(
  transactionXdr: string,
  networkPassphrase: string
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Freighter wallet can only be accessed in the browser");
  }

  try {
    const { signTransaction } = await import("@stellar/freighter-api");

    const signedXdr = await signTransaction(transactionXdr, {
      network: networkPassphrase === Networks.PUBLIC ? "PUBLIC" : "TESTNET",
      accountToSign: undefined,
    });

    if (!signedXdr) {
      throw new Error("Transaction signing was cancelled or failed");
    }

    return signedXdr;
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("rejected") ||
        error.message.includes("denied") ||
        error.message.includes("cancel")
      ) {
        throw new Error("Transaction signing rejected by user");
      }
      throw error;
    }
    throw new Error("Failed to sign transaction with Freighter");
  }
}

export async function signTransactionWithAlbedo(
  transactionXdr: string,
  network: NetworkType
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Albedo wallet can only be accessed in the browser");
  }

  return new Promise((resolve, reject) => {
    const networkParam = network === "mainnet" ? "public" : "testnet";
    const intentUrl = `https://albedo.link/intent/sign-xdr?xdr=${encodeURIComponent(transactionXdr)}&network=${networkParam}`;

    const popup = window.open(intentUrl, "albedo", "width=500,height=600,scrollbars=yes,resizable=yes");

    if (!popup) {
      reject(new Error("Popup blocked. Please allow popups for this site."));
      return;
    }

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        reject(new Error("Transaction signing rejected by user"));
      }
    }, 500);

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== "https://albedo.link") {
        return;
      }

      clearInterval(checkClosed);
      window.removeEventListener("message", messageHandler);

      if (popup && !popup.closed) {
        popup.close();
      }

      if (event.data.signed_envelope_xdr) {
        resolve(event.data.signed_envelope_xdr);
      } else if (event.data.error) {
        reject(new Error(event.data.error || "Transaction signing failed"));
      } else {
        reject(new Error("Failed to sign transaction with Albedo"));
      }
    };

    window.addEventListener("message", messageHandler);

    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener("message", messageHandler);
      if (popup && !popup.closed) {
        popup.close();
      }
      reject(new Error("Transaction signing timeout. Please try again."));
    }, 120000);
  });
}
