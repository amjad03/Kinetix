import { AsyncLocalStorage } from 'node:async_hooks';

/** What every log line and span of one request shares. The auth guard fills in tenant and user. */
export interface RequestContext {
  requestId: string;
  traceId: string;
  spanId: string;
  tenantId?: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
export const currentContext = (): RequestContext | undefined => requestContext.getStore();
