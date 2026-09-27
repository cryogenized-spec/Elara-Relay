export interface ExpectedTable {
  readonly name: string;
  readonly domain: string;
  readonly primaryKey: readonly string[];
  readonly referencedBy?: readonly string[];
  readonly uniqueIdentity?: readonly string[];
  readonly appendOnly?: boolean;
  readonly ownerScoped?: boolean;
}

export interface ExpectedTrigger {
  readonly table: string;
  readonly name: string;
  readonly function: string;
  readonly pinnedSearchPath: boolean;
}

export interface ExpectedUniqueConstraint {
  readonly table: string;
  readonly columns: readonly string[];
  readonly label: string;
}

export interface ExpectedForeignKey {
  readonly table: string;
  readonly columns: readonly string[];
  readonly references: string;
}

export declare const EXPECTED_TABLES: readonly ExpectedTable[];
export declare const EXPECTED_TRIGGERS: readonly ExpectedTrigger[];
export declare const EXPECTED_UNIQUE_CONSTRAINTS: readonly ExpectedUniqueConstraint[];
export declare const EXPECTED_FOREIGN_KEYS: readonly ExpectedForeignKey[];
export declare const BROWSER_ROLE_NAMES: readonly string[];
export declare const TABLE_NAMES: readonly string[];
export declare function getTableContract(name: string): ExpectedTable | null;
export declare function isKnownTableName(name: string): boolean;
