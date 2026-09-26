import type { Operation, Params, Results, ViewState } from '../contracts/index.js';
/** Shared component API; implementations supply transport and view identity. */
export interface LensClient {
  call<K extends Operation>(operation: K, params: Params[K], signal?: AbortSignal): Promise<Results[K]>;
  watch(onView: (view: ViewState) => void, onConnection: (message: string | undefined) => void, signal: AbortSignal): Promise<void>;
}
