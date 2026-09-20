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

# One request carries one Noul per candidate tag; keep the shortlist bounded.
MAX_TAG_CANDIDATES = 24

# Suggestions at or above this probability are worth showing as accepted by
# default. The UI treats it as a starting point, not a rule.
TAG_THRESHOLD = 0.5


@dataclass(frozen=True, slots=True)
class FolderOption:
    """An existing folder offered as a filing destination."""

    id: int
    path: str


@dataclass(frozen=True, slots=True)
class TagOption:
    """One of the user's tags, offered as a candidate.

    Candidates always come from the vault: Jev selects among tags the user has
    created, and never invents one.
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
class TagSuggestion:
    """How strongly Jev associates the note with one of the user's tags."""

    name: str
    probability: float


@dataclass(frozen=True, slots=True)
class Classification:
    """One Jev request's worth of suggestions."""

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
    """Ask Jev about one window of a note: one folder, plus zero or more tags.

    Callers with a long note send several windows and average them with
    `average_classifications`.
    """
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

    # Re-key the distribution by folder id, so windows can be averaged even
    # when their option keys were disambiguated differently.
    probabilities: dict[int | str, float] = {}
    for key, probability in (getattr(folder_answer, "probabilities", None) or {}).items():
        option = by_key.get(key)
        stable_key: int | str = option.id if option else NO_FOLDER
        probabilities[stable_key] = probabilities.get(stable_key, 0.0) + float(probability)

    suggestions = [
        TagSuggestion(
            name=tag.name,
            probability=float(response.nouls[f"tag:{tag.name}"].noul),
        )
        for tag in tag_options
    ]
    suggestions.sort(key=lambda suggestion: suggestion.probability, reverse=True)

    return Classification(
        folder=FolderSuggestion(
            folder_id=chosen.id if chosen else None,
            path=chosen.path if chosen else None,
            confidence=float(folder_answer.confidence),
            probabilities=probabilities,
        ),
        tags=suggestions,
        model=getattr(response, "model", None),
    )


def average_classifications(
    results: Sequence[Classification], folders: Sequence[FolderOption] = ()
) -> Classification:
    """Average the judgments of several windows into one recommendation.

    Every window saw the same questions, so a plain mean is well defined: tags
    average their yes-probabilities, and the folder averages its option
    distribution before the winner is taken. A tag or option a window did not
    mention counts as zero.
    """
    if not results:
        raise ValueError("nothing to average")
    if len(results) == 1:
        return results[0]

    total = float(len(results))

    tag_names: list[str] = []
    tag_totals: dict[str, float] = {}
    for result in results:
        for suggestion in result.tags:
            if suggestion.name not in tag_totals:
                tag_totals[suggestion.name] = 0.0
                tag_names.append(suggestion.name)
            tag_totals[suggestion.name] += suggestion.probability

    averaged_tags = [
        TagSuggestion(name=name, probability=tag_totals[name] / total) for name in tag_names
    ]
    averaged_tags.sort(key=lambda suggestion: suggestion.probability, reverse=True)

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
        tags=averaged_tags,
        model=results[0].model,
    )
