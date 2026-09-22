"""TypeSafe System One integration: client construction and note classification.

Judgment design follows the TypeSafe skill in `.dsh/skills/typesafe-ai`, and the
live docs at https://docs.typesafe.ai are the source of truth for API details.
Credentials stay on the server: the browser only ever talks to this API.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul

from app.core.config import Settings

# The folder question always offers a "nothing fits" answer, so the model is
# never forced into a wrong existing folder.
NO_FOLDER = "__none__"

# One request carries one Noul per candidate category; keep the shortlist bounded.
MAX_CATEGORY_CANDIDATES = 24

# Suggestions at or above this probability are worth showing as accepted by
# default. The UI treats it as a starting point, not a rule.
CATEGORY_THRESHOLD = 0.5


@dataclass(frozen=True, slots=True)
class FolderOption:
    """An existing folder offered as a filing destination."""

    id: int
    path: str


@dataclass(frozen=True, slots=True)
class CategoryOption:
    """One of the user's categories, offered as a candidate.

    Candidates always come from the vault: Jev selects among categories the user
    has created, and never invents one.
    """

    name: str
    id: int
    description: str | None = None


@dataclass(frozen=True, slots=True)
class FolderSuggestion:
    """Where Jev would file the note, with the answer's own confidence.

    `probabilities` maps every offered option to its probability, keyed by
    folder id (or `NO_FOLDER`), which is what makes averaging across windows
    possible.
    """

    folder_id: int | None
    path: str | None
    confidence: float
    probabilities: dict[int | str, float] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class CategorySuggestion:
    """How strongly Jev associates the note with one of the user's categories."""

    name: str
    probability: float


@dataclass(frozen=True, slots=True)
class Classification:
    """One Jev request's worth of suggestions."""

    folder: FolderSuggestion
    categories: list[CategorySuggestion]
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
    categories: Sequence[CategoryOption],
) -> dict[str, Any]:
    """Assemble the state the questions are answered against."""
    return {
        "note": {"title": title or "", "content": content},
        "folders": [{"path": folder.path} for folder in folders],
        "categories": [
            {"name": category.name, "meaning": category.description} for category in categories
        ],
    }


def build_questions(
    folders: Sequence[FolderOption], categories: Sequence[CategoryOption]
) -> dict[str, Choice | Noul]:
    """Ask one folder choice and one yes/no question per candidate category.

    Independent questions travel together in a single request, so the folder
    and category judgments cost one round trip. Each category gets its own Noul
    because a note may belong to several categories at once.
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

    for category in categories:
        meaning = f" It means: {category.description}" if category.description else ""
        questions[f"category:{category.name}"] = Noul(
            instructions=(
                f"Does this note belong under the category `{category.name}`?{meaning} "
                "Answer yes only when someone browsing that category would expect to find "
                "this note."
            )
        )

    return questions


async def classify_note(
    client: AsyncTypeSafeClient,
    *,
    title: str | None,
    content: str,
    folders: Sequence[FolderOption],
    categories: Sequence[CategoryOption],
    model: str | None = None,
) -> Classification:
    """Ask Jev about one window of a note: one folder, plus zero or more categories.

    Callers with a long note send several windows and average them with
    `average_classifications`.
    """
    folder_options = list(folders)
    category_options = list(categories)[:MAX_CATEGORY_CANDIDATES]

    response = await client.system_one(
        state=build_state(
            title=title, content=content, folders=folders, categories=category_options
        ),
        questions=build_questions(folder_options, category_options),
        model=model,
    )

    _, by_key = _folder_criteria(folder_options)
    folder_answer = response.choices["folder"]
    chosen = by_key.get(folder_answer.choice)

    # Re-key the distribution by folder id, so windows can be averaged even
    # when their option keys were disambiguated differently.
    probabilities: dict[int | str, float] = {}
    for key, probability in (getattr(folder_answer, "probabilities", None) or {}).items():
        option = by_key.get(key)
        stable_key: int | str = option.id if option else NO_FOLDER
        probabilities[stable_key] = probabilities.get(stable_key, 0.0) + float(probability)

    suggestions = [
        CategorySuggestion(
            name=category.name,
            probability=float(response.nouls[f"category:{category.name}"].noul),
        )
        for category in category_options
    ]
    suggestions.sort(key=lambda suggestion: suggestion.probability, reverse=True)

    return Classification(
        folder=FolderSuggestion(
            folder_id=chosen.id if chosen else None,
            path=chosen.path if chosen else None,
            confidence=float(folder_answer.confidence),
            probabilities=probabilities,
        ),
        categories=suggestions,
        model=getattr(response, "model", None),
    )


def average_classifications(
    results: Sequence[Classification], folders: Sequence[FolderOption] = ()
) -> Classification:
    """Average the judgments of several windows into one recommendation.

    Every window saw the same questions, so a plain mean is well defined:
    categories average their yes-probabilities, and the folder averages its
    option distribution before the winner is taken. A category or option a
    window did not mention counts as zero.
    """
    if not results:
        raise ValueError("nothing to average")
    if len(results) == 1:
        return results[0]

    total = float(len(results))

    category_names: list[str] = []
    category_totals: dict[str, float] = {}
    for result in results:
        for suggestion in result.categories:
            if suggestion.name not in category_totals:
                category_totals[suggestion.name] = 0.0
                category_names.append(suggestion.name)
            category_totals[suggestion.name] += suggestion.probability

    averaged_categories = [
        CategorySuggestion(name=name, probability=category_totals[name] / total)
        for name in category_names
    ]
    averaged_categories.sort(key=lambda suggestion: suggestion.probability, reverse=True)

    folder_totals: dict[int | str, float] = {}
    for result in results:
        for key, probability in result.folder.probabilities.items():
            folder_totals[key] = folder_totals.get(key, 0.0) + probability

    by_id = {folder.id: folder for folder in folders}
    winner = max(folder_totals, key=lambda key: folder_totals[key]) if folder_totals else NO_FOLDER
    winner_folder = by_id.get(winner) if isinstance(winner, int) else None

    return Classification(
        folder=FolderSuggestion(
            folder_id=winner_folder.id if winner_folder else None,
            path=winner_folder.path if winner_folder else None,
            confidence=sum(result.folder.confidence for result in results) / total,
            probabilities={key: value / total for key, value in folder_totals.items()},
        ),
        categories=averaged_categories,
        model=results[0].model,
    )
