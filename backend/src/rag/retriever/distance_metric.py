"""Distance metric utilities — relevance score conversion for vector search results."""

import math
from enum import Enum


class DistanceMetric(Enum):
    L2 = "l2"
    IP = "ip"
    COSINE = "cosine"


def cosine_relevance_score_fn(distance: float) -> float:
    """Normalize cosine distance to a [0, 1] relevance score."""
    return 1.0 - distance


def euclidean_relevance_score_fn(distance: float) -> float:
    """Convert euclidean distance of normalized vectors to a [0, 1] similarity score."""
    # 0 is most similar, sqrt(2) most dissimilar for normalized embeddings
    return 1.0 - distance / math.sqrt(2)


def max_inner_product_relevance_score_fn(distance: float) -> float:
    """Normalize inner product distance to a [0, 1] score."""
    if distance > 0:
        return 1.0 - distance
    return -1.0 * distance


SUPPORTED_RELEVANCE_SCORE_FUNCTIONS = {
    DistanceMetric.COSINE: cosine_relevance_score_fn,
    DistanceMetric.L2: euclidean_relevance_score_fn,
    DistanceMetric.IP: max_inner_product_relevance_score_fn,
}


def get_relevance_score_fn(distance_metric: DistanceMetric):
    """Return the relevance score function for the given distance metric.

    Args:
        distance_metric: The distance metric enum value.

    Returns:
        Callable that converts a raw distance to a [0, 1] relevance score.

    Raises:
        KeyError: If the distance metric is not supported.
    """
    func = SUPPORTED_RELEVANCE_SCORE_FUNCTIONS.get(distance_metric)

    if func is None:
        raise KeyError(f"No supported normalization function for distance metric of type: {distance_metric}.")

    return func