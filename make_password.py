#!/usr/bin/env python3
"""Make a Deseret Docket login line.

Run:  python3 make_password.py
It asks for a username and password and prints one line for the DOCKET_USERS setting.
Passwords are never stored, only a salted PBKDF2 hash. Run it once per person; put each
line on its own line (or separate them with commas) in DOCKET_USERS.
"""
import getpass, hashlib, os, re, secrets, sys

ITER = 100_000  # Cloudflare's PBKDF2 limit

user = input("Username: ").strip().lower()
if not re.fullmatch(r"[a-z0-9._-]{2,40}", user):
    sys.exit("Use 2-40 letters, numbers, dots, dashes or underscores.")
pw = getpass.getpass("Password (at least 10 characters): ")
if len(pw) < 10:
    sys.exit("That password is too short. Use at least 10 characters.")
if getpass.getpass("Same password again: ") != pw:
    sys.exit("The passwords didn't match. Run it again.")
salt = os.urandom(16)
h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, ITER).hex()
print("\nAdd this line to DOCKET_USERS:\n")
print(f"{user}:pbkdf2:{ITER}:{salt.hex()}:{h}")
print("\nIf you haven't set SESSION_SECRET yet, you can use this one:\n")
print(secrets.token_hex(32))
