from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def ordered_tables(source: sqlite3.Connection) -> list[tuple[str, list[str]]]:
    tables=source.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
    ).fetchall()
    names=[row[0] for row in tables]
    name_set=set(names)
    columns_by_table={}
    dependencies={name:set() for name in names}
    for name in names:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*",name):
            raise ValueError(f"Unsupported SQLite table name: {name}")
        columns_by_table[name]=[row[1] for row in source.execute(f'PRAGMA table_info("{name}")')]
        for reference in source.execute(f'PRAGMA foreign_key_list("{name}")'):
            parent=reference[2]
            if parent in name_set and parent!=name:
                dependencies[name].add(parent)
    ordered=[]
    remaining=set(names)
    while remaining:
        ready=[name for name in names if name in remaining and not (dependencies[name]&remaining)]
        if not ready:
            raise ValueError("The SQLite schema contains a foreign-key cycle; automatic migration stopped.")
        for name in ready:
            ordered.append((name,columns_by_table[name]))
            remaining.remove(name)
    return ordered


def migrate(source_path: Path, database_url: str, confirm_empty_target: bool) -> None:
    if not source_path.is_file():
        raise FileNotFoundError(f"SQLite source database does not exist: {source_path}")
    if not confirm_empty_target:
        raise ValueError("Pass --confirm-empty-target only after creating a fresh PostgreSQL database.")

    os.environ["VOXERA_DATABASE_URL"]=database_url
    from backend import main
    from backend.database import AUTO_ID_TABLES
    import psycopg
    from psycopg.rows import dict_row

    main.init_db()
    source=sqlite3.connect(source_path)
    source.row_factory=sqlite3.Row
    source.execute("BEGIN")
    try:
        tables=ordered_tables(source)
        with psycopg.connect(database_url,row_factory=dict_row) as target:
            for table,_ in tables:
                if table in {"demo_clock","followup_settings"}:
                    continue
                row=target.execute(f'SELECT count(*) AS total FROM "{table}"').fetchone()
                if row["total"]:
                    raise ValueError(f"Target table {table} is not empty; migration refused.")
            target.execute("DELETE FROM demo_clock")
            target.execute("DELETE FROM followup_settings")
            copied={}
            for table,columns in tables:
                if not columns:
                    continue
                target_columns={
                    row["column_name"] for row in target.execute(
                        "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s",
                        (table,),
                    ).fetchall()
                }
                unavailable=set(columns)-target_columns
                if unavailable:
                    raise ValueError(f"Target table {table} is missing source columns: {', '.join(sorted(unavailable))}")
                quoted_columns=", ".join(f'"{column}"' for column in columns)
                placeholders=", ".join(["%s"]*len(columns))
                rows=source.execute(f'SELECT {quoted_columns} FROM "{table}"').fetchall()
                if rows:
                    statement=f'INSERT INTO "{table}" ({quoted_columns}) VALUES ({placeholders})'
                    target.cursor().executemany(statement,[tuple(row) for row in rows])
                copied[table]=len(rows)
            for table in AUTO_ID_TABLES:
                if table not in copied or "id" not in dict(tables)[table]:
                    continue
                target.execute(
                    f"SELECT setval(pg_get_serial_sequence(%s,'id'),coalesce(max(id),1),count(*)>0) FROM \"{table}\"",
                    (table,),
                )
        print(f"Migrated {sum(copied.values())} rows from {source_path.name} into PostgreSQL.")
        for table,count in copied.items():
            if count:print(f"  {table}: {count}")
    finally:
        source.close()


def main_cli() -> int:
    parser=argparse.ArgumentParser(description="Copy a Voxera SQLite database into an empty PostgreSQL database.")
    parser.add_argument("--source",type=Path,default=os.environ.get("VOXERA_SQLITE_SOURCE"))
    parser.add_argument("--database-url",default=os.environ.get("VOXERA_DATABASE_URL"))
    parser.add_argument("--confirm-empty-target",action="store_true")
    args=parser.parse_args()
    if not args.source or not args.database_url:
        parser.error("provide --source and --database-url (or their documented environment variables)")
    migrate(Path(args.source),args.database_url,args.confirm_empty_target)
    return 0


if __name__=="__main__":
    raise SystemExit(main_cli())
