"""Unit tests for distance metric relevance score conversion."""

import math

import pytest

from src.rag.retriever.distance_metric import (
    DistanceMetric,
    get_relevance_score_fn,
    cosine_relevance_score_fn,
    euclidean_relevance_score_fn,
    max_inner_product_relevance_score_fn,
)


class TestScoreFunctions:
    def test_cosine(self):
        assert cosine_relevance_score_fn(0.0) == 1.0
        assert cosine_relevance_score_fn(1.0) == 0.0

    def test_euclidean(self):
        assert euclidean_relevance_score_fn(0.0) == 1.0
        assert euclidean_relevance_score_fn(math.sqrt(2)) == pytest.approx(0.0)

    def test_inner_product_positive(self):
        assert max_inner_product_relevance_score_fn(0.25) == 0.75

    def test_inner_product_negative(self):
        assert max_inner_product_relevance_score_fn(-0.5) == 0.5


class TestGetRelevanceScoreFn:
    def test_returns_correct_fn_per_metric(self):
        assert get_relevance_score_fn(DistanceMetric.COSINE) is cosine_relevance_score_fn
        assert get_relevance_score_fn(DistanceMetric.L2) is euclidean_relevance_score_fn
        assert get_relevance_score_fn(DistanceMetric.IP) is max_inner_product_relevance_score_fn

    def test_unsupported_raises(self):
        with pytest.raises(KeyError):
            get_relevance_score_fn("bogus")
