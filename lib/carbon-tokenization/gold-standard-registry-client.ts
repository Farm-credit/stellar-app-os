import type { ProviderHttpClient } from '../certification/http-client';
import type { GoldStandardClient as GoldStandardAdapter } from '../certification/providers/gold-standard';
import { AbstractRegistryClient } from './registry-client';
import type { RegistryProtocol } from '../certification/types';

export class GoldStandardRegistryClient extends AbstractRegistryClient {
  readonly protocol: RegistryProtocol = 'gold-standard';

  constructor(adapter: GoldStandardAdapter, http: ProviderHttpClient) {
    super(adapter, http);
  }
}
