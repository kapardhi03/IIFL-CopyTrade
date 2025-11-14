"""
Custom exceptions for Copy Trading Platform
All exceptions inherit from base CopyTradingException
"""

class CopyTradingException(Exception):
    """Base exception for all copy trading errors"""
    def __init__(self, message: str, error_code: str = None):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


# ============================================
# AUTHENTICATION EXCEPTIONS
# ============================================
class AuthenticationError(CopyTradingException):
    """Raised when authentication fails"""
    pass


class TokenExpiredError(AuthenticationError):
    """Raised when access token has expired"""
    pass


class InvalidCredentialsError(AuthenticationError):
    """Raised when credentials are invalid"""
    pass


# ============================================
# IIFL API EXCEPTIONS
# ============================================
class IIFLAPIError(CopyTradingException):
    """Base exception for IIFL API errors"""
    pass


class IIFLAuthenticationError(IIFLAPIError):
    """Raised when IIFL authentication fails"""
    pass


class IIFLRateLimitError(IIFLAPIError):
    """Raised when rate limit is exceeded"""
    pass


class IIFLOrderError(IIFLAPIError):
    """Raised when order placement fails"""
    pass


class IIFLConnectionError(IIFLAPIError):
    """Raised when connection to IIFL fails"""
    pass


class IIFLInvalidResponseError(IIFLAPIError):
    """Raised when IIFL returns invalid response"""
    pass


# ============================================
# ORDER EXCEPTIONS
# ============================================
class OrderError(CopyTradingException):
    """Base exception for order-related errors"""
    pass


class OrderNotFoundError(OrderError):
    """Raised when order is not found"""
    pass


class OrderMappingError(OrderError):
    """Raised when order mapping fails"""
    pass


class OrderModificationError(OrderError):
    """Raised when order modification fails"""
    pass


class OrderCancellationError(OrderError):
    """Raised when order cancellation fails"""
    pass


class DuplicateOrderError(OrderError):
    """Raised when attempting to create duplicate order"""
    pass


# ============================================
# MASTER/FOLLOWER EXCEPTIONS
# ============================================
class MasterError(CopyTradingException):
    """Base exception for master-related errors"""
    pass


class MasterNotFoundError(MasterError):
    """Raised when master is not found"""
    pass


class FollowerError(CopyTradingException):
    """Base exception for follower-related errors"""
    pass


class FollowerNotFoundError(FollowerError):
    """Raised when follower is not found"""
    pass


class MappingError(CopyTradingException):
    """Base exception for mapping-related errors"""
    pass


class DuplicateMappingError(MappingError):
    """Raised when duplicate master-follower mapping exists"""
    pass


class MappingNotFoundError(MappingError):
    """Raised when mapping is not found"""
    pass


# ============================================
# RISK MANAGEMENT EXCEPTIONS
# ============================================
class RiskManagementError(CopyTradingException):
    """Base exception for risk management"""
    pass


class MaxCapitalExceededError(RiskManagementError):
    """Raised when order exceeds max capital limit"""
    pass


class DailyLossLimitError(RiskManagementError):
    """Raised when daily loss limit is exceeded"""
    pass


class InsufficientBalanceError(RiskManagementError):
    """Raised when account has insufficient balance"""
    pass


# ============================================
# NATS/MESSAGING EXCEPTIONS
# ============================================
class MessagingError(CopyTradingException):
    """Base exception for messaging errors"""
    pass


class NATSConnectionError(MessagingError):
    """Raised when NATS connection fails"""
    pass


class EventPublishError(MessagingError):
    """Raised when event publishing fails"""
    pass


# ============================================
# REDIS/CACHE EXCEPTIONS
# ============================================
class CacheError(CopyTradingException):
    """Base exception for cache errors"""
    pass


class RedisConnectionError(CacheError):
    """Raised when Redis connection fails"""
    pass


class CacheWriteError(CacheError):
    """Raised when cache write fails"""
    pass


# ============================================
# DATABASE EXCEPTIONS
# ============================================
class DatabaseError(CopyTradingException):
    """Base exception for database errors"""
    pass


class RecordNotFoundError(DatabaseError):
    """Raised when database record is not found"""
    pass


class DuplicateRecordError(DatabaseError):
    """Raised when attempting to create duplicate record"""
    pass


# ============================================
# VALIDATION EXCEPTIONS
# ============================================
class ValidationError(CopyTradingException):
    """Base exception for validation errors"""
    pass


class InvalidScalingFactorError(ValidationError):
    """Raised when scaling factor is invalid"""
    pass


class InvalidOrderQuantityError(ValidationError):
    """Raised when order quantity is invalid"""
    pass
