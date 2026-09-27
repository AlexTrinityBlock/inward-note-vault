"""Hard limits the vault enforces, and why they are where they are.

Categories are the vocabulary Jev chooses from, so their size is bounded for two
reasons: the database column, and the size of one classification request, where
every category becomes a question.

The note cap is a budget, not a storage limit: TypeSafe gives a request 64k
tokens in total and 32k for `state` plus the longest question, so the text sent
for classification is measured in characters and kept far below that.
"""

# A category is a label; 50 characters is generous for one, and keeps the question
# built from it short. Counted in characters, so a CJK category costs one per glyph.
CATEGORY_NAME_MAX_CHARS = 50

# Vault-wide cap on categories. It is well above what one classification request
# can carry: `MAX_CATEGORY_CANDIDATES` in `core/typesafe.py` shortlists the first
# 24, because every candidate becomes a question in the same call. The vault cap
# is headroom for the reader's vocabulary, not a request budget.
CATEGORY_COUNT_MAX = 200

# How much text one Jev request sees. A longer note is sampled in consecutive
# windows of this size and the answers are averaged, so nothing is dropped.
DEFAULT_CLASSIFY_WINDOW_CHARS = 10_000


class LimitExceeded(ValueError):
    """A request asked for more than the vault allows."""


def clean_category_name(name: str) -> str:
    """Trim a category name and check its length."""
    cleaned = name.strip()
    if not cleaned:
        raise LimitExceeded("A category needs a name")
    if len(cleaned) > CATEGORY_NAME_MAX_CHARS:
        raise LimitExceeded(f"A category name can be at most {CATEGORY_NAME_MAX_CHARS} characters")
    return cleaned


def split_windows(text: str, size: int) -> list[str]:
    """Cut `text` into consecutive windows of `size` characters.

    The last window holds the remainder. An empty text is one empty window, so
    callers always have something to send.
    """
    if size <= 0 or len(text) <= size:
        return [text]
    return [text[start : start + size] for start in range(0, len(text), size)]
