"""Format retrieved sources for display in chat responses."""

import os


def prettify_source(source: dict) -> str:
    """Format a single retrieved source into a markdown string.

    Args:
        source: Dict with 'document', 'score', and 'content_preview' keys.

    Returns:
        Formatted markdown string.
    """
    document = os.path.basename(source.get("document", "Unknown"))
    score = source.get("score", 0.0)
    content_preview = source.get("content_preview", "")
    return f"• **{document}** \n\n **Score ({round(score, 2)})** \n\n **Preview:** \n >{content_preview} \n"