import type {
    ColumnInfo,
    ConnectionTestResult,
    DatabaseTree,
    ReorderResult,
    SessionDraft,
    StoredSession,
    TableSnapshot,
    TableTarget
} from '@shared/contracts'
import {
    getValidationErrorMessage,
    sessionConnectionTestSchema
} from '@shared/validation'
import {createHash} from 'node:crypto'
import {Client} from 'pg'

type IdentityMode = '' | 'a' | 'd'
type GeneratedMode = '' | 's'

interface TableMeta {
    oid: number
    relkind: string
    relpersistence: string
    comment: string | null
    estimatedRowCount: number | null
    owner: string
    rowSecurity: boolean
    forceRowSecurity: boolean
}

interface IdentitySettings {
    generation: 'ALWAYS' | 'BY DEFAULT'
    start: string | null
    increment: string | null
    minimum: string | null
    maximum: string | null
    cycle: 'YES' | 'NO' | null
}

interface ColumnMetadata extends ColumnInfo {
    notNull: boolean
    defaultExpression: string | null
    identityMode: IdentityMode
    generatedMode: GeneratedMode
    collationSchema: string | null
    collationName: string | null
    identitySettings: IdentitySettings | null
}

interface LocalConstraint {
    name: string
    type: 'p' | 'u' | 'c' | 'f' | 'x'
    definition: string
}

interface InboundForeignKey {
    name: string
    sourceSchema: string
    sourceTable: string
    definition: string
}

interface IndexMetadata {
    name: string
    definition: string
}

interface TriggerMetadata {
    name: string
    definition: string
}

interface SequenceBinding {
    columnName: string
    sequenceSchema: string
    sequenceName: string
    dependencyType: 'a' | 'i'
}

interface TableBundle {
    meta: TableMeta
    columns: ColumnMetadata[]
    constraints: LocalConstraint[]
    inboundForeignKeys: InboundForeignKey[]
    indexes: IndexMetadata[]
    triggers: TriggerMetadata[]
    sequences: SequenceBinding[]
}

type ConnectionInput = Pick<
    SessionDraft,
    'database' | 'host' | 'password' | 'port' | 'ssl' | 'username'
>

const appName = 'postgresql-column-order-editor'

function withTarget(
    session: StoredSession,
    target?: TableTarget
): StoredSession {
    if (!target) {
        return session
    }

    return {
        ...session,
        schema: target.schema,
        table: target.table
    }
}

function getErrorMessage(error: unknown): string {
    return getValidationErrorMessage(error, 'An unexpected database error occurred.')
}

function quoteIdentifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`
}

function quoteLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`
}

function qualifyName(schema: string, name: string): string {
    return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
}

function stablePgName(...parts: string[]): string {
    const seed = parts.join('__')
    const slug = seed
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
    const hash = createHash('sha1').update(seed).digest('hex').slice(0, 8)
    const maxBaseLength = 63 - hash.length - 1
    const base = slug.slice(0, maxBaseLength) || 'pg_object'
    return `${base}_${hash}`
}

function readablePgName(baseName: string, suffix: string): string {
    const base = `${baseName}_${suffix}`
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')

    if (base.length <= 63) {
        return base
    }

    const hash = createHash('sha1').update(base).digest('hex').slice(0, 8)
    return `${base.slice(0, 54)}_${hash}`
}

function timestampToken(): string {
    const now = new Date()
    const parts = [
        now.getFullYear().toString(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ]

    return `${parts[0]}${parts[1]}${parts[2]}_${parts[3]}${parts[4]}${parts[5]}`
}

function buildTempTableName(table: string): string {
    return readablePgName(table, `reorder_tmp_${timestampToken()}`)
}

function buildHoldingTableName(table: string, backupOriginal: boolean): string {
    return backupOriginal
        ? readablePgName(table, `backup_${timestampToken()}`)
        : readablePgName(table, `replaced_old_${timestampToken()}`)
}

function buildColumnDefinition(column: ColumnMetadata): string {
    const definition: string[] = [
        `${quoteIdentifier(column.name)} ${column.dataType}`
    ]

    if (column.collationSchema && column.collationName) {
        definition.push(
            `COLLATE ${qualifyName(column.collationSchema, column.collationName)}`
        )
    }

    if (column.generatedMode === 's') {
        if (!column.defaultExpression) {
            throw new Error(`Could not read the generated expression for "${column.name}".`)
        }

        definition.push(`GENERATED ALWAYS AS (${column.defaultExpression}) STORED`)
    } else if (column.identityMode) {
        const keyword =
            column.identityMode === 'a'
                ? 'GENERATED ALWAYS AS IDENTITY'
                : 'GENERATED BY DEFAULT AS IDENTITY'
        const options: string[] = []

        if (column.identitySettings?.start) {
            options.push(`START WITH ${column.identitySettings.start}`)
        }
        if (column.identitySettings?.increment) {
            options.push(`INCREMENT BY ${column.identitySettings.increment}`)
        }
        if (column.identitySettings?.minimum) {
            options.push(`MINVALUE ${column.identitySettings.minimum}`)
        }
        if (column.identitySettings?.maximum) {
            options.push(`MAXVALUE ${column.identitySettings.maximum}`)
        }
        if (column.identitySettings?.cycle === 'YES') {
            options.push('CYCLE')
        }

        definition.push(options.length > 0 ? `${keyword} (${options.join(' ')})` : keyword)
    } else if (column.defaultExpression) {
        definition.push(`DEFAULT ${column.defaultExpression}`)
    }

    if (column.notNull) {
        definition.push('NOT NULL')
    }

    return definition.join(' ')
}

function buildCreateTableSql(
    schema: string,
    tempTableName: string,
    relpersistence: string,
    orderedColumns: ColumnMetadata[]
): string {
    const persistence = relpersistence === 'u' ? 'UNLOGGED ' : ''

    return `CREATE ${persistence}TABLE ${qualifyName(schema, tempTableName)} (\n  ${orderedColumns
        .map(buildColumnDefinition)
        .join(',\n  ')}\n)`
}

function buildInsertSql(
    schema: string,
    sourceTableName: string,
    targetTableName: string,
    orderedColumns: ColumnMetadata[]
): string {
    const insertableColumns = orderedColumns.filter(
        (column) => column.generatedMode !== 's'
    )

    if (insertableColumns.length === 0) {
        throw new Error('Tables that contain only generated columns are not supported yet.')
    }

    const names = insertableColumns.map((column) => quoteIdentifier(column.name)).join(', ')
    const requiresIdentityOverride = insertableColumns.some(
        (column) => column.identityMode === 'a'
    )
    const overrideClause = requiresIdentityOverride ? ' OVERRIDING SYSTEM VALUE' : ''

    return `INSERT INTO ${qualifyName(schema, targetTableName)} (${names})${overrideClause} SELECT ${names} FROM ${qualifyName(
        schema,
        sourceTableName
    )}`
}

function rewriteIndexDefinition(definition: string, newIndexName: string): string {
    const rewritten = definition.replace(
        /^CREATE( UNIQUE)? INDEX\s+.+?\s+ON\s+/i,
        (_, uniquePart?: string) =>
            `CREATE${uniquePart ?? ''} INDEX ${quoteIdentifier(newIndexName)} ON `
    )

    if (rewritten === definition) {
        throw new Error(`Could not rewrite the index definition: ${definition}`)
    }

    return rewritten
}

function buildConstraintName(
    table: string,
    constraint: LocalConstraint
): string {
    if (constraint.type === 'p' || constraint.type === 'u' || constraint.type === 'x') {
        return stablePgName(table, constraint.name, 'reordered')
    }

    return constraint.name
}

function buildIndexName(table: string, index: IndexMetadata): string {
    return stablePgName(table, index.name, 'reordered')
}

function parseInteger(value: string | number | null): number | null {
    if (value === null) {
        return null
    }

    const numeric = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(numeric) ? numeric : null
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
    return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

function getConnectionCandidates(input: ConnectionInput): string[] {
    return uniqueNonEmpty([input.database, 'postgres', input.username, 'template1'])
}

function hasTarget(tree: DatabaseTree, target: TableTarget): boolean {
    return tree.schemas.some(
        (schemaNode) =>
            schemaNode.name === target.schema && schemaNode.tables.includes(target.table)
    )
}

function ensureRegularTable(meta: TableMeta): void {
    if (meta.relkind !== 'r') {
        throw new Error(
            'This tool currently works only with regular PostgreSQL tables. Partitioned, foreign, and view-like objects are not supported.'
        )
    }

    if (meta.rowSecurity || meta.forceRowSecurity) {
        throw new Error(
            'Tables with Row Level Security enabled are not supported yet. Policy migration would need to be handled separately.'
        )
    }
}

function assertExactColumnOrder(
    columns: ColumnMetadata[],
    orderedColumns: string[]
): void {
    if (columns.length !== orderedColumns.length) {
        throw new Error('The submitted column count does not match the target table.')
    }

    const existing = new Set(columns.map((column) => column.name))

    for (const columnName of orderedColumns) {
        if (!existing.has(columnName)) {
            throw new Error(`Column "${columnName}" was not found in the target table.`)
        }
    }

    if (new Set(orderedColumns).size !== columns.length) {
        throw new Error('The submitted column list contains duplicate names.')
    }
}

function buildConnection(
    input: ConnectionInput,
    databaseOverride?: string
): Client {
    const password = typeof input.password === 'string' ? input.password : ''

    return new Client({
        host: input.host,
        port: input.port,
        user: input.username,
        password,
        database: databaseOverride ?? input.database,
        ssl: input.ssl ? {rejectUnauthorized: false} : undefined,
        application_name: appName
    })
}

async function getAvailableDatabases(client: Client): Promise<string[]> {
    const result = await client.query<{database_name: string}>(
        `
      SELECT datname AS database_name
      FROM pg_database
      WHERE datistemplate = false
        AND datallowconn = true
      ORDER BY datname
    `
    )

    return result.rows.map((row) => row.database_name)
}

async function getTableMeta(client: Client, session: StoredSession): Promise<TableMeta> {
    const result = await client.query<{
        oid: number
        relkind: string
        relpersistence: string
        comment: string | null
        estimated_rows: string | null
        owner: string
        row_security: boolean
        force_row_security: boolean
    }>(
        `
      SELECT
        c.oid,
        c.relkind,
        c.relpersistence,
        obj_description(c.oid, 'pg_class') AS comment,
        CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint::text END AS estimated_rows,
        pg_get_userbyid(c.relowner) AS owner,
        c.relrowsecurity AS row_security,
        c.relforcerowsecurity AS force_row_security
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
    `,
        [session.schema, session.table]
    )

    const row = result.rows[0]

    if (!row) {
        throw new Error(`Table "${session.schema}.${session.table}" was not found.`)
    }

    return {
        oid: row.oid,
        relkind: row.relkind,
        relpersistence: row.relpersistence,
        comment: row.comment,
        estimatedRowCount: parseInteger(row.estimated_rows),
        owner: row.owner,
        rowSecurity: row.row_security,
        forceRowSecurity: row.force_row_security
    }
}

async function assertSupportedDependencies(
    client: Client,
    session: StoredSession,
    meta: TableMeta
): Promise<void> {
    const inheritance = await client.query<{has_inheritance: boolean}>(
        `
      SELECT EXISTS (
        SELECT 1
        FROM pg_inherits
        WHERE inhparent = $1 OR inhrelid = $1
      ) AS has_inheritance
    `,
        [meta.oid]
    )

    if (inheritance.rows[0]?.has_inheritance) {
        throw new Error(
            'Tables with inheritance or partition relationships are not supported yet.'
        )
    }

    const dependentViews = await client.query<{
        schema_name: string
        object_name: string
        relkind: string
    }>(
        `
      SELECT
        ns.nspname AS schema_name,
        cls.relname AS object_name,
        cls.relkind
      FROM pg_depend dep
      JOIN pg_rewrite rw ON rw.oid = dep.objid
      JOIN pg_class cls ON cls.oid = rw.ev_class
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE dep.refobjid = $1
        AND cls.oid <> $1
        AND cls.relkind IN ('v', 'm')
    `,
        [meta.oid]
    )

    if ((dependentViews.rowCount ?? 0) > 0) {
        const names = dependentViews.rows
            .map((row) => `${row.schema_name}.${row.object_name}`)
            .join(', ')
        throw new Error(
            `Dependent views or materialized views were found: ${names}. The reorder was stopped because those dependencies are not migrated automatically.`
        )
    }

    const rules = await client.query<{rule_name: string}>(
        `
      SELECT rulename AS rule_name
      FROM pg_rules
      WHERE schemaname = $1
        AND tablename = $2
        AND rulename <> '_RETURN'
    `,
        [session.schema, session.table]
    )

    if ((rules.rowCount ?? 0) > 0) {
        const names = rules.rows.map((row) => row.rule_name).join(', ')
        throw new Error(`User-defined rules were found: ${names}. Please handle those rules before reordering.`)
    }
}

async function getIdentitySettings(
    client: Client,
    session: StoredSession
): Promise<Map<string, IdentitySettings>> {
    const result = await client.query<{
        column_name: string
        identity_generation: 'ALWAYS' | 'BY DEFAULT'
        identity_start: string | null
        identity_increment: string | null
        identity_minimum: string | null
        identity_maximum: string | null
        identity_cycle: 'YES' | 'NO' | null
    }>(
        `
      SELECT
        column_name,
        identity_generation,
        identity_start,
        identity_increment,
        identity_minimum,
        identity_maximum,
        identity_cycle
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND is_identity = 'YES'
    `,
        [session.schema, session.table]
    )

    return new Map(
        result.rows.map((row) => [
            row.column_name,
            {
                generation: row.identity_generation,
                start: row.identity_start,
                increment: row.identity_increment,
                minimum: row.identity_minimum,
                maximum: row.identity_maximum,
                cycle: row.identity_cycle
            }
        ])
    )
}

async function getColumns(
    client: Client,
    session: StoredSession
): Promise<ColumnMetadata[]> {
    const identityMap = await getIdentitySettings(client, session)
    const result = await client.query<{
        attnum: number
        attname: string
        formatted_type: string
        attnotnull: boolean
        expression: string | null
        attidentity: IdentityMode
        attgenerated: GeneratedMode
        collation_name: string | null
        collation_schema: string | null
        comment: string | null
    }>(
        `
      SELECT
        attr.attnum,
        attr.attname,
        format_type(attr.atttypid, attr.atttypmod) AS formatted_type,
        attr.attnotnull,
        pg_get_expr(def.adbin, def.adrelid) AS expression,
        attr.attidentity,
        attr.attgenerated,
        coll.collname AS collation_name,
        coll_ns.nspname AS collation_schema,
        col_description(attr.attrelid, attr.attnum) AS comment
      FROM pg_attribute attr
      JOIN pg_class cls ON cls.oid = attr.attrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      JOIN pg_type typ ON typ.oid = attr.atttypid
      LEFT JOIN pg_attrdef def
        ON def.adrelid = attr.attrelid
       AND def.adnum = attr.attnum
      LEFT JOIN pg_collation coll
        ON coll.oid = attr.attcollation
       AND attr.attcollation <> typ.typcollation
      LEFT JOIN pg_namespace coll_ns ON coll_ns.oid = coll.collnamespace
      WHERE ns.nspname = $1
        AND cls.relname = $2
        AND attr.attnum > 0
        AND NOT attr.attisdropped
      ORDER BY attr.attnum
    `,
        [session.schema, session.table]
    )

    return result.rows.map((row) => ({
        name: row.attname,
        dataType: row.formatted_type,
        nullable: !row.attnotnull,
        defaultValue: row.attgenerated === 's' ? null : row.expression,
        isIdentity: row.attidentity !== '',
        isGenerated: row.attgenerated === 's',
        ordinalPosition: row.attnum,
        comment: row.comment,
        notNull: row.attnotnull,
        defaultExpression: row.expression,
        identityMode: row.attidentity,
        generatedMode: row.attgenerated,
        collationSchema: row.collation_schema,
        collationName: row.collation_name,
        identitySettings: identityMap.get(row.attname) ?? null
    }))
}

async function getLocalConstraints(client: Client, tableOid: number): Promise<LocalConstraint[]> {
    const result = await client.query<{
        conname: string
        contype: 'p' | 'u' | 'c' | 'f' | 'x'
        definition: string
    }>(
        `
      SELECT
        conname,
        contype,
        pg_get_constraintdef(oid, true) AS definition
      FROM pg_constraint
      WHERE conrelid = $1
        AND contype IN ('p', 'u', 'c', 'f', 'x')
      ORDER BY
        CASE contype
          WHEN 'p' THEN 0
          WHEN 'u' THEN 1
          WHEN 'c' THEN 2
          WHEN 'x' THEN 3
          WHEN 'f' THEN 4
          ELSE 5
        END,
        conname
    `,
        [tableOid]
    )

    return result.rows.map((row) => ({
        name: row.conname,
        type: row.contype,
        definition: row.definition
    }))
}

async function getInboundForeignKeys(
    client: Client,
    tableOid: number
): Promise<InboundForeignKey[]> {
    const result = await client.query<{
        conname: string
        source_schema: string
        source_table: string
        definition: string
    }>(
        `
      SELECT
        con.conname,
        ns.nspname AS source_schema,
        cls.relname AS source_table,
        pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE con.confrelid = $1
        AND con.contype = 'f'
        AND con.conrelid <> $1
      ORDER BY ns.nspname, cls.relname, con.conname
    `,
        [tableOid]
    )

    return result.rows.map((row) => ({
        name: row.conname,
        sourceSchema: row.source_schema,
        sourceTable: row.source_table,
        definition: row.definition
    }))
}

async function getIndexes(client: Client, tableOid: number): Promise<IndexMetadata[]> {
    const result = await client.query<{
        name: string
        definition: string
    }>(
        `
      SELECT
        idx.relname AS name,
        pg_get_indexdef(ind.indexrelid) AS definition
      FROM pg_index ind
      JOIN pg_class idx ON idx.oid = ind.indexrelid
      LEFT JOIN pg_constraint con ON con.conindid = ind.indexrelid
      WHERE ind.indrelid = $1
        AND con.oid IS NULL
      ORDER BY idx.relname
    `,
        [tableOid]
    )

    return result.rows.map((row) => ({
        name: row.name,
        definition: row.definition
    }))
}

async function getTriggers(
    client: Client,
    tableOid: number
): Promise<TriggerMetadata[]> {
    const result = await client.query<{
        tgname: string
        definition: string
    }>(
        `
      SELECT
        tgname,
        pg_get_triggerdef(oid, true) AS definition
      FROM pg_trigger
      WHERE tgrelid = $1
        AND NOT tgisinternal
      ORDER BY tgname
    `,
        [tableOid]
    )

    return result.rows.map((row) => ({
        name: row.tgname,
        definition: row.definition
    }))
}

async function getOwnedSequences(
    client: Client,
    schema: string,
    table: string
): Promise<SequenceBinding[]> {
    const result = await client.query<{
        column_name: string
        sequence_schema: string
        sequence_name: string
        dependency_type: 'a' | 'i'
    }>(
        `
      SELECT
        attr.attname AS column_name,
        seq_ns.nspname AS sequence_schema,
        seq.relname AS sequence_name,
        dep.deptype AS dependency_type
      FROM pg_class tbl
      JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
      JOIN pg_attribute attr
        ON attr.attrelid = tbl.oid
       AND attr.attnum > 0
       AND NOT attr.attisdropped
      JOIN pg_depend dep
        ON dep.refobjid = tbl.oid
       AND dep.refobjsubid = attr.attnum
       AND dep.classid = 'pg_class'::regclass
       AND dep.refclassid = 'pg_class'::regclass
       AND dep.deptype IN ('a', 'i')
      JOIN pg_class seq
        ON seq.oid = dep.objid
       AND seq.relkind = 'S'
      JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
      WHERE tbl_ns.nspname = $1
        AND tbl.relname = $2
      ORDER BY attr.attnum
    `,
        [schema, table]
    )

    return result.rows.map((row) => ({
        columnName: row.column_name,
        sequenceSchema: row.sequence_schema,
        sequenceName: row.sequence_name,
        dependencyType: row.dependency_type
    }))
}

async function getDatabaseTree(client: Client): Promise<DatabaseTree> {
    const result = await client.query<{
        schema_name: string
        table_name: string
    }>(
        `
      SELECT
        ns.nspname AS schema_name,
        cls.relname AS table_name
      FROM pg_class cls
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE cls.relkind IN ('r', 'p')
        AND ns.nspname <> 'information_schema'
        AND ns.nspname NOT IN ('pg_catalog')
        AND ns.nspname NOT LIKE 'pg_toast%'
        AND ns.nspname NOT LIKE 'pg_temp_%'
      ORDER BY ns.nspname, cls.relname
    `
    )

    const schemaMap = new Map<string, string[]>()

    for (const row of result.rows) {
        const current = schemaMap.get(row.schema_name) ?? []
        current.push(row.table_name)
        schemaMap.set(row.schema_name, current)
    }

    return {
        schemas: [...schemaMap.entries()].map(([name, tables]) => ({
            name,
            tables
        }))
    }
}

async function loadBundle(client: Client, session: StoredSession): Promise<TableBundle> {
    const meta = await getTableMeta(client, session)
    ensureRegularTable(meta)
    await assertSupportedDependencies(client, session, meta)

    const columns = await getColumns(client, session)
    const constraints = await getLocalConstraints(client, meta.oid)
    const inboundForeignKeys = await getInboundForeignKeys(client, meta.oid)
    const indexes = await getIndexes(client, meta.oid)
    const triggers = await getTriggers(client, meta.oid)
    const sequences = await getOwnedSequences(client, session.schema, session.table)

    return {
        meta,
        columns,
        constraints,
        inboundForeignKeys,
        indexes,
        triggers,
        sequences
    }
}

async function applyComments(
    client: Client,
    session: StoredSession,
    meta: TableMeta,
    columns: ColumnMetadata[]
): Promise<void> {
    const tableName = qualifyName(session.schema, session.table)

    if (meta.comment !== null) {
        await client.query(`COMMENT ON TABLE ${tableName} IS ${quoteLiteral(meta.comment)}`)
    }

    for (const column of columns) {
        if (column.comment !== null) {
            await client.query(
                `COMMENT ON COLUMN ${tableName}.${quoteIdentifier(column.name)} IS ${quoteLiteral(column.comment)}`
            )
        }
    }
}

async function createConstraints(
    client: Client,
    session: StoredSession,
    constraints: LocalConstraint[],
    filter: (constraint: LocalConstraint) => boolean
): Promise<void> {
    for (const constraint of constraints.filter(filter)) {
        const name = buildConstraintName(session.table, constraint)
        await client.query(
            `ALTER TABLE ${qualifyName(session.schema, session.table)} ADD CONSTRAINT ${quoteIdentifier(name)} ${constraint.definition}`
        )
    }
}

async function createIndexes(
    client: Client,
    session: StoredSession,
    indexes: IndexMetadata[]
): Promise<void> {
    for (const index of indexes) {
        const sql = rewriteIndexDefinition(index.definition, buildIndexName(session.table, index))
        await client.query(sql)
    }
}

async function createTriggers(
    client: Client,
    triggers: TriggerMetadata[]
): Promise<void> {
    for (const trigger of triggers) {
        await client.query(trigger.definition)
    }
}

async function recreateInboundForeignKeys(
    client: Client,
    inboundForeignKeys: InboundForeignKey[]
): Promise<void> {
    for (const foreignKey of inboundForeignKeys) {
        await client.query(
            `ALTER TABLE ${qualifyName(foreignKey.sourceSchema, foreignKey.sourceTable)} ADD CONSTRAINT ${quoteIdentifier(foreignKey.name)} ${foreignKey.definition}`
        )
    }
}

async function dropInboundForeignKeys(
    client: Client,
    inboundForeignKeys: InboundForeignKey[]
): Promise<void> {
    for (const foreignKey of inboundForeignKeys) {
        await client.query(
            `ALTER TABLE ${qualifyName(foreignKey.sourceSchema, foreignKey.sourceTable)} DROP CONSTRAINT ${quoteIdentifier(foreignKey.name)}`
        )
    }
}

async function syncSerialSequenceOwnership(
    client: Client,
    session: StoredSession,
    sequences: SequenceBinding[]
): Promise<void> {
    for (const sequence of sequences.filter((item) => item.dependencyType === 'a')) {
        await client.query(
            `ALTER SEQUENCE ${qualifyName(sequence.sequenceSchema, sequence.sequenceName)} OWNED BY ${qualifyName(
                session.schema,
                session.table
            )}.${quoteIdentifier(sequence.columnName)}`
        )
    }
}

async function renameIdentitySequencesForBackup(
    client: Client,
    originalSequences: SequenceBinding[],
    currentSequences: SequenceBinding[],
    backupOriginal: boolean
): Promise<Map<string, SequenceBinding>> {
    const currentByColumn = new Map(
        currentSequences.map((sequence) => [sequence.columnName, sequence])
    )

    for (const original of originalSequences.filter((item) => item.dependencyType === 'i')) {
        const current = currentByColumn.get(original.columnName)

        if (!current) {
            throw new Error(`The identity sequence for "${original.columnName}" was not found on the reordered table.`)
        }

        const originalQualified = qualifyName(original.sequenceSchema, original.sequenceName)
        const backupSequenceName = stablePgName(original.sequenceName, 'backup')

        if (backupOriginal) {
            await client.query(
                `ALTER SEQUENCE ${originalQualified} RENAME TO ${quoteIdentifier(backupSequenceName)}`
            )
            await client.query(
                `ALTER SEQUENCE ${qualifyName(current.sequenceSchema, current.sequenceName)} RENAME TO ${quoteIdentifier(original.sequenceName)}`
            )
            current.sequenceName = original.sequenceName
        }
    }

    return currentByColumn
}

async function renameIdentitySequencesAfterDrop(
    client: Client,
    originalSequences: SequenceBinding[],
    currentSequences: Map<string, SequenceBinding>
): Promise<void> {
    for (const original of originalSequences.filter((item) => item.dependencyType === 'i')) {
        const current = currentSequences.get(original.columnName)

        if (!current) {
            throw new Error(`The identity sequence for "${original.columnName}" was not found on the reordered table.`)
        }

        if (current.sequenceName !== original.sequenceName) {
            await client.query(
                `ALTER SEQUENCE ${qualifyName(current.sequenceSchema, current.sequenceName)} RENAME TO ${quoteIdentifier(original.sequenceName)}`
            )
            current.sequenceName = original.sequenceName
        }
    }
}

async function setSequenceValues(
    client: Client,
    session: StoredSession,
    originalSequences: SequenceBinding[],
    currentIdentitySequences: Map<string, SequenceBinding>
): Promise<void> {
    const finalTableName = qualifyName(session.schema, session.table)

    for (const sequence of originalSequences) {
        const effectiveSequence =
            sequence.dependencyType === 'i'
                ? currentIdentitySequences.get(sequence.columnName) ?? sequence
                : sequence

        await client.query(
            `
        SELECT setval(
          $1::regclass,
          COALESCE((SELECT MAX(${quoteIdentifier(sequence.columnName)}) FROM ${finalTableName}), 1),
          (SELECT MAX(${quoteIdentifier(sequence.columnName)}) IS NOT NULL FROM ${finalTableName})
        )
      `,
            [`${effectiveSequence.sequenceSchema}.${effectiveSequence.sequenceName}`]
        )
    }
}

async function setFinalOwnership(
    client: Client,
    session: StoredSession,
    meta: TableMeta,
    originalSequences: SequenceBinding[],
    currentIdentitySequences: Map<string, SequenceBinding>
): Promise<void> {
    await client.query(
        `ALTER TABLE ${qualifyName(session.schema, session.table)} OWNER TO ${quoteIdentifier(meta.owner)}`
    )

    for (const sequence of originalSequences) {
        const effectiveSequence =
            sequence.dependencyType === 'i'
                ? currentIdentitySequences.get(sequence.columnName) ?? sequence
                : sequence

        await client.query(
            `ALTER SEQUENCE ${qualifyName(
                effectiveSequence.sequenceSchema,
                effectiveSequence.sequenceName
            )} OWNER TO ${quoteIdentifier(meta.owner)}`
        )
    }
}

async function withClient<T>(
    session: StoredSession,
    callback: (client: Client) => Promise<T>
): Promise<T> {
    const client = buildConnection(session)
    await client.connect()

    try {
        return await callback(client)
    } catch (error) {
        throw new Error(getErrorMessage(error))
    } finally {
        await client.end()
    }
}

async function withDraftClient<T>(
    draft: SessionDraft,
    callback: (client: Client, connectedDatabase: string) => Promise<T>
): Promise<T> {
    const candidates = getConnectionCandidates(draft)
    const connectionErrors: string[] = []

    for (const databaseName of candidates) {
        const client = buildConnection(draft, databaseName)

        try {
            await client.connect()
        } catch (error) {
            connectionErrors.push(getErrorMessage(error))

            try {
                await client.end()
            } catch {
                // Ignore shutdown errors after a failed connection attempt.
            }

            continue
        }

        try {
            return await callback(client, databaseName)
        } catch (error) {
            throw new Error(getErrorMessage(error))
        } finally {
            await client.end()
        }
    }

    throw new Error(
        connectionErrors[0] ??
        'Could not connect to PostgreSQL with the supplied host, port, and credentials.'
    )
}

export async function testSessionConnection(
    draft: SessionDraft
): Promise<ConnectionTestResult> {
    const validatedDraft = sessionConnectionTestSchema.parse(draft)

    return withDraftClient(validatedDraft, async (client, connectedDatabase) => ({
        connectedDatabase,
        databases: await getAvailableDatabases(client)
    }))
}

export async function fetchTableSnapshot(
    session: StoredSession,
    target?: TableTarget
): Promise<TableSnapshot> {
    return withClient(session, async (client) => {
        const databaseTree = await getDatabaseTree(client)
        const resolvedTarget =
            target && hasTarget(databaseTree, target)
                ? target
                : null

        if (!resolvedTarget) {
            return {
                session,
                target: null,
                databaseTree,
                qualifiedName: null,
                estimatedRowCount: null,
                columns: [],
                lastConnectedAt: new Date().toISOString()
            }
        }

        const activeSession = withTarget(session, resolvedTarget)
        const meta = await getTableMeta(client, activeSession)
        const columns = await getColumns(client, activeSession)

        return {
            session,
            target: resolvedTarget,
            databaseTree,
            qualifiedName: `${activeSession.schema}.${activeSession.table}`,
            estimatedRowCount: meta.estimatedRowCount,
            columns: columns.map((column) => ({
                name: column.name,
                dataType: column.dataType,
                nullable: column.nullable,
                defaultValue: column.defaultValue,
                isIdentity: column.isIdentity,
                isGenerated: column.isGenerated,
                ordinalPosition: column.ordinalPosition,
                comment: column.comment
            })),
            lastConnectedAt: new Date().toISOString()
        }
    })
}

export async function reorderTableColumns(
    session: StoredSession,
    orderedColumnNames: string[],
    deleteBackupTableAfterReorder: boolean,
    target?: TableTarget
): Promise<ReorderResult> {
    return withClient(session, async (client) => {
        const activeSession = withTarget(session, target)
        const keepBackupTable = !deleteBackupTableAfterReorder
        await client.query('BEGIN')

        try {
            await client.query(`SET LOCAL lock_timeout = '15s'`)
            await client.query(
                `LOCK TABLE ${qualifyName(activeSession.schema, activeSession.table)} IN ACCESS EXCLUSIVE MODE`
            )

            const bundle = await loadBundle(client, activeSession)
            assertExactColumnOrder(bundle.columns, orderedColumnNames)

            const columnMap = new Map(bundle.columns.map((column) => [column.name, column]))
            const orderedColumns = orderedColumnNames.map((name) => {
                const column = columnMap.get(name)

                if (!column) {
                    throw new Error(`Column "${name}" was not found in the target table.`)
                }

                return column
            })

            const tempTableName = buildTempTableName(activeSession.table)
            const holdingTableName = buildHoldingTableName(activeSession.table, keepBackupTable)
            const createTableSql = buildCreateTableSql(
                activeSession.schema,
                tempTableName,
                bundle.meta.relpersistence,
                orderedColumns
            )

            await client.query(createTableSql)
            await client.query(
                buildInsertSql(activeSession.schema, activeSession.table, tempTableName, orderedColumns)
            )

            await dropInboundForeignKeys(client, bundle.inboundForeignKeys)
            await client.query(
                `ALTER TABLE ${qualifyName(activeSession.schema, activeSession.table)} RENAME TO ${quoteIdentifier(holdingTableName)}`
            )
            await client.query(
                `ALTER TABLE ${qualifyName(activeSession.schema, tempTableName)} RENAME TO ${quoteIdentifier(activeSession.table)}`
            )

            await applyComments(client, activeSession, bundle.meta, orderedColumns)

            await createConstraints(client, activeSession, bundle.constraints, (constraint) =>
                constraint.type !== 'f'
            )

            await syncSerialSequenceOwnership(client, activeSession, bundle.sequences)

            const currentIdentitySequences = await renameIdentitySequencesForBackup(
                client,
                bundle.sequences,
                await getOwnedSequences(client, activeSession.schema, activeSession.table),
                keepBackupTable
            )

            if (!keepBackupTable) {
                await client.query(`DROP TABLE ${qualifyName(activeSession.schema, holdingTableName)}`)
                await renameIdentitySequencesAfterDrop(
                    client,
                    bundle.sequences,
                    currentIdentitySequences
                )
            }

            await setSequenceValues(
                client,
                activeSession,
                bundle.sequences,
                currentIdentitySequences
            )

            await createConstraints(client, activeSession, bundle.constraints, (constraint) =>
                constraint.type === 'f'
            )
            await createIndexes(client, activeSession, bundle.indexes)
            await createTriggers(client, bundle.triggers)
            await recreateInboundForeignKeys(client, bundle.inboundForeignKeys)
            await setFinalOwnership(
                client,
                activeSession,
                bundle.meta,
                bundle.sequences,
                currentIdentitySequences
            )

            await client.query('COMMIT')

            return {
                qualifiedName: `${activeSession.schema}.${activeSession.table}`,
                backupTableName: keepBackupTable ? holdingTableName : null,
                message: keepBackupTable
                    ? `Column order updated. The original table was kept as ${holdingTableName}.`
                    : 'Column order updated. The backup table was deleted after the reorder.'
            }
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        }
    })
}
