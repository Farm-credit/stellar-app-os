import type { ProviderHttpClient } from '../certification/http-client';
import type { VerraClient as VerraAdapter } from '../certification/providers/verra';
import { AbstractRegistryClient } from './registry-client';
import type { RegistryProtocol } from '../certification/types';

export class VerraRegistryClient extends AbstractRegistryClient {
  readonly protocol: RegistryProtocol = 'verra';

  constructor(adapter: VerraAdapter, http: ProviderHttpClient) {
    super(adapter, http);
  }
}
