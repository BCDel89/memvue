from __future__ import annotations

import json
import re


EXTRACT_SYSTEM = """\
You extract structured memory entries from raw text.

Given a JSON schema and source text, return a JSON array of objects matching the schema.
Each object represents one distinct memory worth storing.
Be conservative — only extract clear, factual, reusable information.
Omit preamble, explanations, or markdown fences. Respond with only valid JSON.\
"""

TAG_SYSTEM = """\
You assign short topic tags to a memory entry.

Return a JSON array of lowercase strings. Tags should be 1-2 words, hyphenated if needed.
If a taxonomy is provided, prefer terms from it. Add new tags only when clearly appropriate.
Respond with only a valid JSON array — no markdown, no explanation.\
"""

SUMMARIZE_SYSTEM = """\
You summarize a list of memory entries into a concise digest.

Format: a bulleted markdown list. Each bullet is one key fact. Be terse.
No preamble, no headers. Just bullets starting with "- ".\
"""


def parse_json(raw: str):
    """Strip markdown fences if present, then parse JSON."""
    raw = raw.strip()
    m = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, re.DOTALL)
    if m:
        raw = m.group(1).strip()
    return json.loads(raw)
