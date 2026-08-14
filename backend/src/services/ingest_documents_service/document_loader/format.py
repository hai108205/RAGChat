"""Per-format separator lists for markdown-aware recursive text splitting."""

from enum import Enum


class Format(Enum):
    MARKDOWN = "markdown"


SUPPORTED_FORMATS = {
    Format.MARKDOWN.value: [
        # First, try to split along Markdown headings (starting with level 2)
        "\n#{1,6} ",
        # End of code block
        "```\n",
        # Horizontal lines
        "\n\\*\\*\\*+\n",
        "\n---+\n",
        "\n___+\n",
        # Paragraphs
        "\n\n",
        # Lines
        "\n",
        # Words
        " ",
        # Characters
        "",
    ]
}


def get_separators(format: str) -> list[str]:
    """
    Retrieve the list of separators for a given format.

    Args:
        format: The format for which to retrieve separators.

    Returns:
        A list of separators for the specified format.

    Raises:
        KeyError: If the format is not supported.
    """
    separators = SUPPORTED_FORMATS.get(format)

    if separators is None:
        raise KeyError(format + " is a not supported format")

    return separators
