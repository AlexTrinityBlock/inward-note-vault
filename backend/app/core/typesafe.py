"""TypeSafe System One integration: client construction and note classification.

Judgment design follows the TypeSafe skill in `.dsh/skills/typesafe-ai`, and the
live docs at https://docs.typesafe.ai are the source of truth for API details.
Credentials stay on the server: the browser only ever talks to this API.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul

from app.core.config import Settings

# The folder question always offers a "nothing fits" answer, so the model is
# never forced into a wrong existing folder.
NO_FOLDER = "__none__"

# One request carries one Noul per candidate tag; keep the shortlist bounded.
MAX_TAG_CANDIDATES = 24

# Suggestions at or above this probability are worth showing as accepted by
# default. The UI treats it as a starting point, not a rule.
TAG_THRESHOLD = 0.5

# Shipped vocabulary, used alongside the user's own tags so that a brand-new
# vault can still be classified. Jev selects among candidates; code owns
# creating them, so a suggested tag only exists once the user accepts it.
DEFAULT_TAGS: tuple[tuple[str, str], ...] = (
    ("Work", "Job tasks, meetings, colleagues, and work projects."),
    ("Personal", "Private life: family, friends, home, and errands."),
    ("Idea", "A thought worth developing later, not yet a task."),
    ("Task", "Something the author intends to do."),
    ("Reference", "Material kept to look up again: facts, links, documentation."),
    ("Finance", "Money: bills, invoices, budgets, taxes, purchases."),
    ("Health", "Medical notes, symptoms, appointments, fitness."),
    ("Travel", "Trips, itineraries, bookings, places to visit."),
    ("Learning", "Study notes, courses, and things being learned."),
    ("Shopping", "Items to buy and purchase decisions."),
    ("Recipe", "Food, cooking, and ingredients."),
    ("Journal", "Dated reflections and diary entries."),
)


@dataclass(frozen=True, slots=True)
class FolderOption:
    """An existing folder offered as a filing destination."""

    id: int
    path: str


@dataclass(frozen=True, slots=True)
class TagOption:
    """A tag offered as a candidate. `id` is `None` for the shipped vocabulary."""

    name: str
    description: str | None = None
    id: int | None = None

    @property
    def existing(self) -> bool:
        """Whether the tag already exists in the vault."""
        return self.id is not None


@dataclass(frozen=True, slots=True)
class FolderSuggestion:
    """Where Jev would file the note, with the answer's own confidence."""

    folder_id: int | None
    path: str | None
    confidence: float


@dataclass(frozen=True, slots=True)
class TagSuggestion:
    """How strongly Jev associates the note with one candidate tag."""

    name: str
    probability: float
    existing: bool


@dataclass(frozen=True, slots=True)
class Classification:
    """One classification round trip's worth of suggestions."""

    folder: FolderSuggestion
    tags: list[TagSuggestion]
    model: str | None


def create_typesafe_client(
    settings: Settings, *, api_key: str | None = None
) -> AsyncTypeSafeClient:
    """Build an async client for the System One API.

    `None` values fall back to the SDK's own environment lookup, so
    `TYPESAFE_API_KEY` set in the process environment still works.
    """
    return AsyncTypeSafeClient(
        api_key=api_key or settings.typesafe_api_key,
        model=settings.typesafe_model,
        timeout=settings.typesafe_timeout_seconds,
    )


def _folder_criteria(
    folders: Sequence[FolderOption],
) -> tuple[dict[str, str | None], dict[str, FolderOption]]:
    """Build unique Choice criteria keys for the folder question.

    Two folders can share a display path; the key must stay unique or the
    criteria mapping would drop one of them.
    """
    criteria: dict[str, str | None] = {}
    by_key: dict[str, FolderOption] = {}

    for folder in folders:
        key = folder.path
        if key in criteria or key == NO_FOLDER:
            key = f"{folder.path} (#{folder.id})"
        criteria[key] = None
        by_key[key] = folder

    criteria[NO_FOLDER] = "No existing folder fits this note."
    return criteria, by_key


def build_state(
    *,
    title: str | None,
    content: str,
    folders: Sequence[FolderOption],
    tags: Sequence[TagOption],
) -> dict[str, Any]:
    """Assemble the state the questions are answered against."""
    return {
        "note": {"title": title or "", "content": content},
        "folders": [{"path": folder.path} for folder in folders],
        "tags": [{"name": tag.name, "meaning": tag.description} for tag in tags],
    }


def build_questions(
    folders: Sequence[FolderOption], tags: Sequence[TagOption]
) -> dict[str, Choice | Noul]:
    """Ask one folder choice and one yes/no question per candidate tag.

    Independent questions travel together in a single request, so the folder
    and tag judgments cost one round trip. Each tag gets its own Noul because
    a note may belong to several tags at once.
    """
    criteria, _ = _folder_criteria(folders)
    questions: dict[str, Choice | Noul] = {
        "folder": Choice(
            instructions=(
                "Which existing folder should this note be filed in? "
                "Judge only by the note's subject matter and the listed folder paths. "
                f"Choose `{NO_FOLDER}` when no existing folder fits."
            ),
            criteria=criteria,
        )
    }

    for tag in tags:
        meaning = f" It means: {tag.description}" if tag.description else ""
        questions[f"tag:{tag.name}"] = Noul(
            instructions=(
                f"Does this note belong under the tag `{tag.name}`?{meaning} "
                "Answer yes only when someone browsing that tag would expect to find this note."
            )
        )

    return questions


async def classify_note(
    client: AsyncTypeSafeClient,
    *,
    title: str | None,
    content: str,
    folders: Sequence[FolderOption],
    tags: Sequence[TagOption],
    model: str | None = None,
) -> Classification:
    """Ask Jev where a note belongs: one folder, plus zero or more tags."""
    folder_options = list(folders)
    tag_options = list(tags)[:MAX_TAG_CANDIDATES]

    response = await client.system_one(
        state=build_state(title=title, content=content, folders=folders, tags=tag_options),
        questions=build_questions(folder_options, tag_options),
        model=model,
    )

    _, by_key = _folder_criteria(folder_options)
    folder_answer = response.choices["folder"]
    chosen = by_key.get(folder_answer.choice)

    suggestions = [
        TagSuggestion(
            name=tag.name,
            probability=float(response.nouls[f"tag:{tag.name}"].noul),
            existing=tag.existing,
        )
        for tag in tag_options
    ]
    suggestions.sort(key=lambda suggestion: suggestion.probability, reverse=True)

    return Classification(
        folder=FolderSuggestion(
            folder_id=chosen.id if chosen else None,
            path=chosen.path if chosen else None,
            confidence=float(folder_answer.confidence),
        ),
        tags=suggestions,
        model=getattr(response, "model", None),
    )
