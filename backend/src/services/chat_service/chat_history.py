"""Fixed-size ring buffer for chat history (server-side Q&A memory)."""


class ChatHistory(list):
    """Fixed-size list that evicts oldest entries when full."""

    def __init__(self, messages: list | None = None, total_length: int = -1):
        """Initialise the queue with a fixed total length.

        Args:
            messages: A list of initial messages.
            total_length: The maximum number of messages the chat history can hold.
        """
        if messages is None:
            messages = []

        super().__init__(messages)
        self.total_length = total_length

    def append(self, msg: str):
        """Append a message; evict oldest if at capacity.

        Args:
            msg: The message to be added to the chat history.
        """
        if len(self) == self.total_length:
            self.pop(0)
        super().append(msg)

    def __str__(self):
        """Get the chat history as a single newline-joined string."""
        return "\n".join(list(self))


def init_chat_history(total_length: int = 2) -> ChatHistory:
    """Create a new ChatHistory with the given max length."""
    return ChatHistory(total_length=total_length)