from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterable, Sequence
from typing import Any


AUTO_ID_TABLES = {
    "attendance",
    "audit_log",
    "certificates",
    "conversations",
    "demo_clock",
    "enrolments",
    "followup_cases",
    "followup_deliveries",
    "followup_settings",
    "live_chat_messages",
    "live_presence_intervals",
    "messages",
    "organisations",
    "outcome_checkins",
    "participant_direct_conversations",
    "participant_direct_messages",
    "programme_group_messages",
    "programme_reviews",
    "programmes",
    "sessions",
    "users",
    "video_comments",
}


class HybridRow(dict[str, Any]):
    def __init__(self, names: Sequence[str], values: Sequence[Any]):
        super().__init__(zip(names, values))
        self._names = names

    def __getitem__(self, key: str | int) -> Any:
        if isinstance(key, int):
            key = self._names[key]
        return super().__getitem__(key)


class PostgresCursor:
    def __init__(self, cursor: Any, generated_id: int | None = None):
        self._cursor = cursor
        self._generated_id = generated_id

    @property
    def lastrowid(self) -> int | None:
        return self._generated_id

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    def fetchone(self) -> HybridRow | None:
        row = self._cursor.fetchone()
        return HybridRow(tuple(row.keys()), tuple(row.values())) if row is not None else None

    def fetchall(self) -> list[HybridRow]:
        return [HybridRow(tuple(row.keys()), tuple(row.values())) for row in self._cursor.fetchall()]


class PostgresConnection:
    def __init__(self, connection: Any):
        self._connection = connection

    def execute(self, query: str, parameters: Iterable[Any] = ()) -> PostgresCursor:
        sql, fetch_generated_id = translate_query(query)
        cursor = self._connection.cursor()
        cursor.execute(sql, tuple(parameters))
        generated_id = None
        if fetch_generated_id and cursor.description:
            row = cursor.fetchone()
            if row is not None:
                generated_id = row["id"]
                cursor = _BufferedCursor(cursor, row)
        return PostgresCursor(cursor, generated_id)

    def executescript(self, script: str) -> None:
        for statement in script.split(";"):
            if statement.strip():
                self.execute(statement)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()


class _BufferedCursor:
    def __init__(self, cursor: Any, first_row: Any):
        self._cursor = cursor
        self._first_row = first_row
        self.rowcount = cursor.rowcount
        self.description = cursor.description

    def fetchone(self) -> Any:
        if self._first_row is not None:
            row, self._first_row = self._first_row, None
            return row
        return self._cursor.fetchone()

    def fetchall(self) -> list[Any]:
        rows = self._cursor.fetchall()
        if self._first_row is not None:
            rows.insert(0, self._first_row)
            self._first_row = None
        return rows


def translate_query(query: str) -> tuple[str, bool]:
    sql = query.strip().rstrip(";")
    ignored = bool(re.match(r"INSERT\s+OR\s+IGNORE\s+INTO\s+", sql, re.IGNORECASE))
    replaced = bool(re.match(r"INSERT\s+OR\s+REPLACE\s+INTO\s+", sql, re.IGNORECASE))
    sql = re.sub(r"INSERT\s+OR\s+(?:IGNORE|REPLACE)\s+INTO\s+", "INSERT INTO ", sql, flags=re.IGNORECASE)
    if ignored:
        sql = f"{sql} ON CONFLICT DO NOTHING"
    elif replaced:
        match = re.match(
            r"INSERT INTO \w+\s*\(([^)]+)\)\s*VALUES\s*\(",
            sql,
            re.IGNORECASE,
        )
        if not match:
            raise ValueError("PostgreSQL compatibility cannot translate this INSERT OR REPLACE query.")
        columns = [column.strip() for column in match.group(1).split(",")]
        conflict_column = columns[0]
        updates = [column for column in columns[1:] if column != conflict_column]
        clause = ", ".join(f"{column}=EXCLUDED.{column}" for column in updates)
        sql = f"{sql} ON CONFLICT ({conflict_column}) DO "
        sql += f"UPDATE SET {clause}" if clause else "NOTHING"
    sql = re.sub(r"\bgroup_concat\s*\(", "string_agg(", sql, flags=re.IGNORECASE)
    match = re.match(r"INSERT\s+INTO\s+(\w+)", sql, re.IGNORECASE)
    fetch_id = bool(match and match.group(1).casefold() in AUTO_ID_TABLES)
    if fetch_id:
        sql += " RETURNING id"
    sql = _replace_placeholders(sql)
    return sql, fetch_id


def _replace_placeholders(sql: str) -> str:
    output: list[str] = []
    quote: str | None = None
    index = 0
    while index < len(sql):
        char = sql[index]
        if quote:
            output.append(char)
            if char == quote:
                if index + 1 < len(sql) and sql[index + 1] == quote:
                    output.append(sql[index + 1])
                    index += 1
                else:
                    quote = None
        elif char in {"'", '"'}:
            quote = char
            output.append(char)
        elif char == "?":
            output.append("%s")
        else:
            output.append(char)
        index += 1
    return "".join(output)


def postgres_schema(script: str) -> str:
    return re.sub(
        r"\bid INTEGER PRIMARY KEY\b",
        "id SERIAL PRIMARY KEY",
        script,
        flags=re.IGNORECASE,
    )


def postgres_table_columns(connection: Any, table: str) -> set[str]:
    row = connection.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?",
        (table,),
    ).fetchall()
    return {item["column_name"] for item in row}


def integrity_errors() -> tuple[type[BaseException], ...]:
    try:
        from psycopg import IntegrityError
    except ImportError:
        return (sqlite3.IntegrityError,)
    return sqlite3.IntegrityError, IntegrityError
