import type { Instrumentation } from 'next';

export async function register(): Promise<void> {}

export const onRequestError: Instrumentation.onRequestError = async () => {};
