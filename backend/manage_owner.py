from __future__ import annotations

import getpass
import re

from backend import main


def create_owner() -> None:
    main.init_db()
    name = input("Platform owner name: ").strip()
    email = input("Platform owner email: ").strip().casefold()
    if len(name) < 2 or len(name) > 100:
        raise SystemExit("Enter a name between 2 and 100 characters.")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise SystemExit("Enter a valid email address.")
    password = getpass.getpass("Create owner password (12+ characters): ")
    confirmation = getpass.getpass("Confirm owner password: ")
    if password != confirmation:
        raise SystemExit("Passwords did not match.")
    if len(password) < 12 or len(password.encode()) > 72:
        raise SystemExit("Use a password between 12 and 72 UTF-8 bytes.")

    with main.connect() as db:
        if db.execute("SELECT 1 FROM users WHERE lower(username)=lower(?)", (email,)).fetchone():
            raise SystemExit("An account already uses that email.")
        user_id = db.execute(
            "INSERT INTO users(name,username,password_hash,role,language,area,created_at,organisation_id) VALUES(?,?,?,'admin','English','',?,NULL)",
            (name, email, main.password_hash(password), main.now()),
        ).lastrowid
        db.execute("INSERT INTO platform_owners(user_id,created_at) VALUES(?,?)", (user_id, main.now()))
        main.audit(db, user_id, "platform_owner_created", "created via local management command")
    print(f"Platform owner account created for {email}. Sign in from Platform owner access.")


if __name__ == "__main__":
    create_owner()
