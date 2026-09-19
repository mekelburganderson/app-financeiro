import { mkdir, writeFile } from 'node:fs/promises';
import { createTestDatabase } from './db-harness.mjs';

// Derive types from migrations in disposable PostgreSQL. Works without Docker,
// credentials or a deployed project. No hand-maintained table/enum duplication.
const db = await createTestDatabase();
try {
  const { rows: enums } = await db.query(`select t.typname, array_agg(e.enumlabel order by e.enumsortorder) labels
    from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
    where n.nspname='public' group by t.typname order by t.typname`);
  const enumNames = new Set(enums.map((e) => e.typname));
  function type(name) {
    if (name.startsWith('_')) return `(${type(name.slice(1))})[]`;
    if (enumNames.has(name)) return `Database['public']['Enums']['${name}']`;
    if (['int2', 'int4', 'int8', 'numeric', 'float4', 'float8'].includes(name)) return 'number';
    if (name === 'bool') return 'boolean';
    if (name === 'void') return 'undefined';
    if (['json', 'jsonb'].includes(name)) return 'Json';
    return 'string';
  }
  const { rows: columns } = await db.query(`select c.table_name,c.column_name,c.udt_name,
    c.is_nullable,c.column_default,t.table_type from information_schema.columns c
    join information_schema.tables t using(table_schema,table_name)
    where c.table_schema='public' order by c.table_name,c.ordinal_position`);
  const { rows: relations } = await db.query(`select cl.relname as table_name, con.conname,
    array(select a.attname from unnest(con.conkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.num order by k.ord) as columns,
    foreign_cl.relname as referenced_relation,
    array(select a.attname from unnest(con.confkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.num order by k.ord) as referenced_columns
    from pg_constraint con join pg_class cl on cl.oid=con.conrelid
    join pg_class foreign_cl on foreign_cl.oid=con.confrelid
    join pg_namespace ns on ns.oid=cl.relnamespace
    join pg_namespace fns on fns.oid=foreign_cl.relnamespace
    where con.contype='f' and ns.nspname='public' and fns.nspname='public'
    order by cl.relname,con.conname`);
  let output = '// Generated from supabase/migrations by npm run db:types. Do not edit.\n';
  output += 'export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\n';
  output += 'export type Database = {\n  public: {\n';
  for (const [kind, tableType] of [['Tables', 'BASE TABLE'], ['Views', 'VIEW']]) {
    output += `    ${kind}: {\n`;
    for (const table of [...new Set(columns.filter((c) => c.table_type === tableType).map((c) => c.table_name))]) {
      const cols = columns.filter((c) => c.table_name === table);
      output += `      ${table}: {\n`;
      for (const shape of (kind === 'Tables' ? ['Row', 'Insert', 'Update'] : ['Row'])) {
        output += `        ${shape}: {\n`;
        for (const c of cols) {
          const optional = shape === 'Update' || (shape === 'Insert' && (c.is_nullable === 'YES' || c.column_default !== null));
          output += `          ${c.column_name}${optional ? '?' : ''}: ${type(c.udt_name)}${c.is_nullable === 'YES' ? ' | null' : ''};\n`;
        }
        output += '        };\n';
      }
      output += '        Relationships: [\n';
      for (const r of relations.filter((r) => r.table_name === table)) {
        output += `          { foreignKeyName: ${JSON.stringify(r.conname)}; columns: ${JSON.stringify(r.columns)}; isOneToOne: false; referencedRelation: ${JSON.stringify(r.referenced_relation)}; referencedColumns: ${JSON.stringify(r.referenced_columns)} },\n`;
      }
      output += '        ];\n      };\n';
    }
    output += '    };\n';
  }
  const { rows: functions } = await db.query(`select p.proname,t.typname as result_type,p.proargnames,
    array(select pt.typname from unnest(p.proargtypes) with ordinality a(oid,ord)
      join pg_type pt on pt.oid=a.oid order by a.ord) as arg_types,p.pronargdefaults
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype
    where n.nspname='public' order by p.proname`);
  output += '    Functions: {\n';
  for (const f of functions) {
    output += `      ${f.proname}: { Args: { `;
    // PostgreSQL arguments can receive NULL even when the function rejects it at
    // runtime. Preserve that call shape for optional date, note and account inputs.
    output += (f.proargnames ?? []).map((name, i) => `${name}${i >= f.arg_types.length - f.pronargdefaults ? '?' : ''}: ${type(f.arg_types[i])} | null`).join('; ');
    output += ` }; Returns: ${type(f.result_type)} };\n`;
  }
  output += '    };\n    Enums: {\n';
  for (const e of enums) output += `      ${e.typname}: ${e.labels.map((label) => JSON.stringify(label)).join(' | ')};\n`;
  output += '    };\n    CompositeTypes: { [_ in never]: never };\n  };\n};\n';
  output += "\nexport type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];\n";
  output += "export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];\n";
  await mkdir(new URL('../src/types/', import.meta.url), { recursive: true });
  await writeFile(new URL('../src/types/database.ts', import.meta.url), output, 'utf8');
  console.log('Generated src/types/database.ts from applied migrations.');
} finally {
  await db.close();
}
