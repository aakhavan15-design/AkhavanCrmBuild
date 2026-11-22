export const SINGLETON_PREFIX: string;
export const PAYROLL_COLLECTIONS: readonly string[];
export const PRIVATE_PERSONNEL_COLLECTIONS: readonly string[];
export function stripPrivatePersonnel<State extends { attachments?: { entityType: string }[] }>(state: State): State;
export function isMarkedFixture(record: unknown, id?: string | null): boolean;
export function fnv1a(text: string): string;
export function hashRecord(record: unknown): string;
export function idFieldOf(name: string, registry: any): string;
export function recordId(record: any, name: string, registry: any): string | null;
export function classify(key: string, value: unknown, registry: any): 'collection' | 'singleton' | 'local';
export function policyOf(name: string, registry: any): { read: string; write: string; refs: Record<string, string>; idField: string; profile: string; appendOnly: boolean; maxLocal: number };
export function splitState(state: any, registry: any): { collections: Record<string, Map<string, any>>; singletons: Record<string, any> };
export interface HashIndex { collections: Record<string, Map<string, string>>; singletons: Record<string, string> }
export function buildHashIndex(split: ReturnType<typeof splitState>): HashIndex;
export interface ChangeSet { upserts: Record<string, any[]>; deletes: Record<string, string[]>; singletons: Record<string, any>; count: number }
export function diffAgainstIndex(index: HashIndex, nextState: any, registry: any): ChangeSet;
export function applyToIndex(index: HashIndex, change: ChangeSet, registry: any): void;
export function snapshotToState(snapshot: any): Record<string, any>;
export function checkIntegrity(collectionLists: Record<string, any[]>, registry: any): Array<{ collection: string; id: string | null; field: string; value: string; target: string }>;
export function profileCollections(collectionLists: Record<string, any[]>): Record<string, { rows: number; fields: Record<string, { types: string[]; coverage: number }> }>;
export function mergeSnapshot(local: any, snapshot: any, index: HashIndex, registry: any): { patch: Record<string, any>; index: HashIndex };
