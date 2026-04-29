declare module 'snarkjs' {
  export const groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasm: Uint8Array,
      zkey: Uint8Array
    ) => Promise<{
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol?: string;
        curve?: string;
      };
      publicSignals: string[];
    }>;
    verify: (verificationKey: unknown, publicSignals: string[], proof: unknown) => Promise<boolean>;
  };
}
