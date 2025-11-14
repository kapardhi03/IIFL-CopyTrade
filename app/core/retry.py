"""
Retry utilities with exponential backoff
Critical for handling IIFL API rate limits and transient failures
"""
import asyncio
import logging
from typing import Callable, TypeVar, Any, Optional, Type, Tuple
from functools import wraps
from app.core.exceptions import IIFLRateLimitError, IIFLConnectionError

logger = logging.getLogger(__name__)

T = TypeVar('T')


async def exponential_backoff_retry(
    func: Callable[..., T],
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
    **kwargs
) -> T:
    """
    Retry a function with exponential backoff

    Args:
        func: Async function to retry
        *args: Positional arguments for func
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential calculation
        exceptions: Tuple of exceptions to catch and retry
        **kwargs: Keyword arguments for func

    Returns:
        Result of func

    Raises:
        Last exception if all retries exhausted
    """
    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)

            if attempt > 0:
                logger.info(
                    f"Retry successful on attempt {attempt + 1}/{max_retries + 1} "
                    f"for {func.__name__}"
                )

            return result

        except exceptions as e:
            last_exception = e

            if attempt >= max_retries:
                logger.error(
                    f"All retry attempts exhausted for {func.__name__}: {str(e)}",
                    exc_info=True
                )
                raise

            # Calculate delay with exponential backoff
            delay = min(base_delay * (exponential_base ** attempt), max_delay)

            logger.warning(
                f"Attempt {attempt + 1}/{max_retries + 1} failed for {func.__name__}: {str(e)}. "
                f"Retrying in {delay:.2f}s..."
            )

            await asyncio.sleep(delay)

    # This should never be reached, but for type safety
    if last_exception:
        raise last_exception


def retry_on_failure(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
):
    """
    Decorator for retrying async functions with exponential backoff

    Usage:
        @retry_on_failure(max_retries=3, base_delay=1.0)
        async def my_function():
            # Your code here
            pass
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            return await exponential_backoff_retry(
                func,
                *args,
                max_retries=max_retries,
                base_delay=base_delay,
                max_delay=max_delay,
                exponential_base=exponential_base,
                exceptions=exceptions,
                **kwargs
            )
        return wrapper
    return decorator


# Specialized retry decorators for IIFL API
def retry_iifl_api(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
):
    """
    Retry decorator specifically for IIFL API calls
    Handles rate limits and connection errors
    """
    return retry_on_failure(
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        exceptions=(IIFLRateLimitError, IIFLConnectionError, asyncio.TimeoutError)
    )


async def retry_with_jitter(
    func: Callable[..., T],
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: float = 0.1,
    **kwargs
) -> T:
    """
    Retry with jitter to avoid thundering herd problem

    Args:
        func: Async function to retry
        *args: Positional arguments
        max_retries: Maximum retry attempts
        base_delay: Base delay in seconds
        max_delay: Maximum delay in seconds
        jitter: Jitter factor (0.0 to 1.0)
        **kwargs: Keyword arguments

    Returns:
        Result of func
    """
    import random

    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)

            return result

        except Exception as e:
            last_exception = e

            if attempt >= max_retries:
                raise

            # Calculate delay with exponential backoff and jitter
            base = base_delay * (2 ** attempt)
            jitter_amount = base * jitter * (2 * random.random() - 1)
            delay = min(base + jitter_amount, max_delay)

            logger.warning(
                f"Attempt {attempt + 1}/{max_retries + 1} failed: {str(e)}. "
                f"Retrying in {delay:.2f}s..."
            )

            await asyncio.sleep(delay)

    if last_exception:
        raise last_exception


class CircuitBreaker:
    """
    Circuit breaker pattern implementation
    Prevents cascading failures by temporarily blocking requests
    """
    def __init__(
        self,
        failure_threshold: int = 5,
        timeout: float = 60.0,
        expected_exception: Type[Exception] = Exception
    ):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = "closed"  # closed, open, half_open

    async def call(self, func: Callable[..., T], *args, **kwargs) -> T:
        """
        Call function through circuit breaker

        Args:
            func: Function to call
            *args: Positional arguments
            **kwargs: Keyword arguments

        Returns:
            Result of func

        Raises:
            Exception: If circuit is open or func raises
        """
        import time

        # Check if circuit should be half-open
        if self.state == "open":
            if time.time() - self.last_failure_time >= self.timeout:
                self.state = "half_open"
                logger.info("Circuit breaker entering half-open state")
            else:
                raise Exception("Circuit breaker is OPEN")

        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)

            # Reset on success
            if self.state == "half_open":
                self.state = "closed"
                self.failure_count = 0
                logger.info("Circuit breaker closed after successful call")

            return result

        except self.expected_exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()

            if self.failure_count >= self.failure_threshold:
                self.state = "open"
                logger.error(
                    f"Circuit breaker OPENED after {self.failure_count} failures"
                )

            raise
