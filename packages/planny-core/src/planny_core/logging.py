"""Structured logging configuration.

Lives in ``planny_core`` so every entrypoint (API, workers, CLI) can configure
logging identically without importing the FastAPI application.

Note: this module intentionally shares its name with the standard library
``logging`` package. Python 3 uses absolute imports, so ``import logging``
elsewhere still resolves to the standard library.
"""

from __future__ import annotations

import structlog

__all__ = ["configure_structlog"]


def configure_structlog() -> None:
    """Configure structlog processors, renderer and logger factory.

    Idempotent: calling it more than once simply reapplies the same
    configuration, which keeps it safe to invoke from tests and from
    application startup.
    """
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
