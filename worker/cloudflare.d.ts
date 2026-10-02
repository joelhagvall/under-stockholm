// The few Cloudflare Workers runtime types the worker uses, declared here so it type-checks with the rest of the
// project (DOM and Bun types). Cloudflare's full runtime types redeclare the DOM's and cannot be loaded beside them.

declare module 'cloudflare:workers' {
  export abstract class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

type SqlStorageValue = string | number | null | ArrayBuffer;
interface SqlCursor<T> { toArray(): T[]; one(): T }
interface SqlStorage { exec<T = Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]): SqlCursor<T> }
interface DurableObjectStorage {
  sql: SqlStorage;
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
interface DurableObjectState {
  waitUntil(promise: Promise<unknown>): void;
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface DurableObjectId { toString(): string }
interface DurableObjectStub { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespace { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub }
interface Fetcher { fetch(request: Request): Promise<Response> }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void }
declare class WebSocketPair { 0: WebSocket; 1: WebSocket }
interface WebSocket { accept(): void }
interface ResponseInit { webSocket?: WebSocket | null }
interface CacheStorage { readonly default: Cache }
interface RateLimit { limit(options: { key: string }): Promise<{ success: boolean }> }
