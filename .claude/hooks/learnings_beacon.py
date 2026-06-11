#!/usr/bin/env python3
"""Cloud-session learnings beacon (repo-committed hook).

User-authorized pipeline (2026-06-10): in CLOUD Claude Code sessions only
(CLAUDE_CODE_REMOTE=true), extract the USER side of the session transcript,
scrub secrets, and PUT it to the owner's private git-markdown inbox repo
(carrollr01/claude-learnings-inbox) via the GitHub contents API. The owner's
local machine fetches that inbox on a 3-hour schedule and mines it for
learnings, mirroring how local transcripts are mined. Local sessions exit
immediately.

Runs as a Stop + SessionEnd hook from the repo's .claude/settings.json.

Cloud environment requirements (configured once per environment on claude.ai):
  - env var LEARNINGS_GH_TOKEN: fine-grained PAT, Contents read/write,
    scoped to ONLY the inbox repo (falls back to GH_TOKEN / GITHUB_TOKEN)
  - network access to api.github.com (add to allowed domains if the
    environment uses "Trusted" network access)

Fail-silent by design: no token, no network, no transcript -> exit 0.

Manual test:  echo '{}' | CLAUDE_CODE_REMOTE=true python3 learnings_beacon.py --dry-run
"""

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

INBOX_REPO = os.environ.get("LEARNINGS_INBOX_REPO", "carrollr01/claude-learnings-inbox")
MAX_CONTENT_CHARS = 150_000
MAX_MSG_CHARS = 2_000
PUSH_MIN_INTERVAL_S = 600  # Stop fires every turn; push at most every 10 min
HTTP_TIMEOUT_S = 10
STATE = Path.home() / ".learnings_beacon_state.json"
DISTILLER_MARKER = "You are a learning distiller"

SECRET_RULES = [
    (re.compile(r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?|ftp)://[^\s'\"`]+", re.I),
     "[REDACTED-URL]"),
    (re.compile(r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key|connection[_-]?string)(\s*[:=]\s*)(\S+)"),
     r"\1\2[REDACTED]"),
    (re.compile(r"\b(?:sk|rk)-[A-Za-z0-9_\-]{16,}\b"), "[REDACTED-KEY]"),
    (re.compile(r"\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}\b"), "[REDACTED-KEY]"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), "[REDACTED-KEY]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED-KEY]"),
    (re.compile(r"\bxox[a-z]-[A-Za-z0-9\-]{10,}\b"), "[REDACTED-KEY]"),
    (re.compile(r"\bAIza[A-Za-z0-9_\-]{30,}\b"), "[REDACTED-KEY]"),
    (re.compile(r"\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b"), "[REDACTED-JWT]"),
]


def scrub(text: str) -> str:
    for rule, repl in SECRET_RULES:
        text = rule.sub(repl, text)
    return text


def find_token() -> str | None:
    for var in ("LEARNINGS_GH_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"):
        tok = os.environ.get(var, "").strip()
        if tok:
            return tok
    return None


def repo_slug(cwd: str) -> str:
    try:
        url = subprocess.run(
            ["git", "config", "--get", "remote.origin.url"],
            capture_output=True, text=True, timeout=5, cwd=cwd or None,
        ).stdout.strip()
        if url:
            name = url.rstrip("/").split("/")[-1]
            return re.sub(r"\.git$", "", name) or "unknown-repo"
    except (subprocess.TimeoutExpired, OSError):
        pass
    return Path(cwd).name if cwd else "unknown-repo"


def extract_user_msgs(transcript: Path) -> list[str]:
    msgs: list[str] = []
    try:
        with open(transcript, encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                if e.get("type") != "user":
                    continue
                content = (e.get("message") or {}).get("content")
                parts: list[str] = []
                if isinstance(content, str):
                    parts.append(content)
                elif isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            parts.append(item.get("text", ""))
                text = "\n".join(p for p in parts if p).strip()
                if not text or text.startswith("<") or "<system-reminder>" in text:
                    continue
                if DISTILLER_MARKER in text:
                    continue
                msgs.append(text[:MAX_MSG_CHARS])
    except OSError:
        return []
    return msgs


def gh_request(method: str, url: str, token: str, body: dict | None = None) -> dict | None:
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "learnings-beacon")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=HTTP_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main() -> int:
    dry = "--dry-run" in sys.argv[1:]
    if os.environ.get("CLAUDE_CODE_REMOTE", "").lower() not in ("true", "1"):
        return 0

    payload = {}
    try:
        if sys.stdin is not None and not sys.stdin.isatty():
            payload = json.loads(sys.stdin.read() or "{}")
    except (OSError, ValueError):
        pass

    session_id = payload.get("session_id", "")
    event = payload.get("hook_event_name", "")
    cwd = payload.get("cwd", "") or os.getcwd()

    tp = payload.get("transcript_path")
    transcript = Path(tp) if tp else None
    if transcript is None or not transcript.exists():
        candidates = list((Path.home() / ".claude" / "projects").glob("*/*.jsonl"))
        transcript = max(candidates, key=lambda p: p.stat().st_mtime) if candidates else None
    if transcript is None or not transcript.exists():
        return 0
    if not session_id:
        session_id = transcript.stem

    msgs = extract_user_msgs(transcript)
    if not msgs:
        return 0
    body_text = scrub("\n\n---\n\n".join(msgs))[-MAX_CONTENT_CHARS:]
    digest = hashlib.sha256(body_text.encode("utf-8")).hexdigest()

    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    prev = state.get(session_id, {})
    if prev.get("sha") == digest:
        return 0
    if event != "SessionEnd" and time.time() - prev.get("ts", 0) < PUSH_MIN_INTERVAL_S:
        return 0

    slug = repo_slug(cwd)
    # header must be static: the local miner reads these files by byte offset,
    # so every push must only ever APPEND relative to the previous content
    content = (f"# Cloud session extract\n\n- session: `{session_id}`\n"
               f"- repo: `{slug}`\n\n---\n\n{body_text}\n")

    if dry:
        print(f"WOULD PUSH {slug}/{session_id}.md ({len(content)} chars, {len(msgs)} msgs)")
        print(content[:600])
        return 0

    token = find_token()
    if not token:
        return 0

    api = f"https://api.github.com/repos/{INBOX_REPO}/contents/{slug}/{session_id}.md"
    existing = gh_request("GET", api, token)
    put_body = {
        "message": f"capture {slug}/{session_id[:8]} ({event or 'stop'})",
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
    }
    if existing and existing.get("sha"):
        put_body["sha"] = existing["sha"]
    gh_request("PUT", api, token, put_body)

    state[session_id] = {"sha": digest, "ts": time.time()}
    try:
        STATE.write_text(json.dumps(state), encoding="utf-8")
    except OSError:
        pass
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)  # never block the session
