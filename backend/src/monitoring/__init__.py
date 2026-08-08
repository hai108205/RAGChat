"""Prometheus metrics instrumentation for FastAPI."""

from prometheus_fastapi_instrumentator import Instrumentator, metrics
from prometheus_fastapi_instrumentator.metrics import Info
from prometheus_client import Counter, Histogram, Gauge
from fastapi import FastAPI

# Custom application metrics
rag_requests_total = Counter(
    "ragchat_requests_total",
    "Total RAG requests processed",
    ["endpoint", "status"],
)

rag_request_duration_seconds = Histogram(
    "ragchat_request_duration_seconds",
    "RAG request latency in seconds",
    ["endpoint"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0],
)

documents_indexed_total = Counter(
    "ragchat_documents_indexed_total",
    "Total documents indexed",
)

chunks_stored_total = Counter(
    "ragchat_chunks_stored_total",
    "Total chunks stored in vector DB",
)

llm_calls_total = Counter(
    "ragchat_llm_calls_total",
    "Total LLM API calls",
    ["provider", "model"],
)

llm_call_duration_seconds = Histogram(
    "ragchat_llm_call_duration_seconds",
    "LLM API call latency in seconds",
    ["provider", "model"],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0],
)

embedding_requests_total = Counter(
    "ragchat_embedding_requests_total",
    "Total embedding API calls",
    ["model"],
)

vector_search_duration_seconds = Histogram(
    "ragchat_vector_search_duration_seconds",
    "Vector search latency in seconds",
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0],
)

active_sessions = Gauge(
    "ragchat_active_sessions",
    "Active conversation sessions",
)

documents_count = Gauge(
    "ragchat_documents_count",
    "Total indexed documents",
)


def setup_metrics(app: FastAPI) -> None:
    """Install Prometheus metrics middleware on the FastAPI app."""
    instrumentator = Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        should_instrument_requests_inprogress=True,
        excluded_handlers=["/metrics", "/health"],
        inprogress_name="ragchat_http_requests_inprogress",
        inprogress_labels=True,
    )

    instrumentator.add(
        metrics.request_size(
            metric_name="ragchat_http_request_size_bytes",
            should_include_handler=True,
            should_include_method=True,
        )
    )
    instrumentator.add(
        metrics.response_size(
            metric_name="ragchat_http_response_size_bytes",
            should_include_handler=True,
            should_include_method=True,
        )
    )
    instrumentator.add(
        metrics.latency(
            metric_name="ragchat_http_request_duration_seconds",
            should_include_handler=True,
            should_include_method=True,
        )
    )
    instrumentator.add(
        metrics.requests(
            metric_name="ragchat_http_requests_total",
            should_include_handler=True,
            should_include_method=True,
        )
    )

    instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=True)