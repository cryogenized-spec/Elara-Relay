import type { PoolClient } from 'pg';

export interface SchemaFacts {
  readonly tables: readonly string[];
  readonly rls: ReadonlyMap<string, boolean>;
  readonly privileges: readonly {
    readonly roleName: string;
    readonly tableName: string;
    readonly canSelect: boolean;
    readonly canInsert: boolean;
    readonly canUpdate: boolean;
    readonly canDelete: boolean;
  }[];
  readonly triggers: readonly {
    readonly tableName: string;
    readonly triggerName: string;
    readonly enabled: boolean;
    readonly functionName: string;
    readonly proconfig: readonly string[];
  }[];
  readonly uniques: readonly {
    readonly tableName: string;
    readonly columns: readonly string[];
  }[];
  readonly foreignKeys: readonly {
    readonly tableName: string;
    readonly columns: readonly string[];
    readonly refTable: string;
    readonly refColumns: readonly string[];
  }[];
}

export interface TableDigest {
  readonly name: string;
  readonly rowCount: number;
  readonly checksum: string;
}

export interface RecoveryProbes {
  readonly eventId?: string;
  readonly mutationReceiptId?: string;
  readonly chatMessageId?: string;
  readonly chatThreadId?: string;
  readonly foreignOwnerId?: string;
}

export declare const CHECKSUM_ALGORITHM: string;
export declare function collectSchemaFacts(
  client: PoolClient,
): Promise<SchemaFacts>;
export declare function collectTableDigests(
  client: PoolClient,
): Promise<TableDigest[]>;
export declare function listPublicTables(
  client: PoolClient,
): Promise<string[]>;
export declare function runNegativeProbes(
  client: PoolClient,
  probes: RecoveryProbes,
): Promise<
  readonly { readonly name: string; readonly passed: boolean; readonly detail: string }[]
>;
