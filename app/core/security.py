"""
Security utilities for encryption and key management
Used to encrypt sensitive data like API keys and credentials
"""
import base64
import secrets
from typing import Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
from cryptography.hazmat.backends import default_backend
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import JWTError, jwt
import logging

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class EncryptionService:
    """
    Service for encrypting/decrypting sensitive data
    Uses Fernet (symmetric encryption)
    """

    def __init__(self, encryption_key: Optional[str] = None):
        """
        Initialize encryption service

        Args:
            encryption_key: Base64-encoded encryption key (auto-generated if None)
        """
        if encryption_key:
            self.key = encryption_key.encode()
        else:
            # Generate a new key
            self.key = Fernet.generate_key()

        self.cipher = Fernet(self.key)

    @staticmethod
    def generate_key() -> str:
        """Generate a new encryption key"""
        return Fernet.generate_key().decode()

    @staticmethod
    def derive_key_from_password(password: str, salt: Optional[bytes] = None) -> tuple[bytes, bytes]:
        """
        Derive encryption key from password using PBKDF2

        Args:
            password: Password to derive key from
            salt: Salt for key derivation (auto-generated if None)

        Returns:
            Tuple of (key, salt)
        """
        if salt is None:
            salt = secrets.token_bytes(16)

        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )

        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        return key, salt

    def encrypt(self, data: str) -> str:
        """
        Encrypt string data

        Args:
            data: Plain text string

        Returns:
            Base64-encoded encrypted string
        """
        try:
            encrypted = self.cipher.encrypt(data.encode())
            return encrypted.decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise

    def decrypt(self, encrypted_data: str) -> str:
        """
        Decrypt encrypted string

        Args:
            encrypted_data: Base64-encoded encrypted string

        Returns:
            Decrypted plain text string
        """
        try:
            decrypted = self.cipher.decrypt(encrypted_data.encode())
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise

    def encrypt_dict(self, data: dict) -> dict:
        """
        Encrypt all values in a dictionary

        Args:
            data: Dictionary with string values

        Returns:
            Dictionary with encrypted values
        """
        return {key: self.encrypt(str(value)) for key, value in data.items()}

    def decrypt_dict(self, encrypted_data: dict) -> dict:
        """
        Decrypt all values in a dictionary

        Args:
            encrypted_data: Dictionary with encrypted values

        Returns:
            Dictionary with decrypted values
        """
        return {key: self.decrypt(value) for key, value in encrypted_data.items()}


# Global encryption service instance
# In production, use a key from environment variable or secrets manager
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service(encryption_key: Optional[str] = None) -> EncryptionService:
    """Get or create global encryption service instance"""
    global _encryption_service

    if _encryption_service is None:
        _encryption_service = EncryptionService(encryption_key)

    return _encryption_service


# ============================================
# PASSWORD HASHING
# ============================================
def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt

    Args:
        password: Plain text password

    Returns:
        Hashed password
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash

    Args:
        plain_password: Plain text password
        hashed_password: Hashed password

    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


# ============================================
# JWT TOKEN MANAGEMENT
# ============================================
def create_access_token(
    data: dict,
    secret_key: str,
    expires_delta: Optional[timedelta] = None,
    algorithm: str = "HS256"
) -> str:
    """
    Create a JWT access token

    Args:
        data: Data to encode in token
        secret_key: Secret key for signing
        expires_delta: Token expiration time
        algorithm: JWT algorithm

    Returns:
        Encoded JWT token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=30)

    to_encode.update({"exp": expire, "iat": datetime.utcnow()})

    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=algorithm)
    return encoded_jwt


def decode_access_token(
    token: str,
    secret_key: str,
    algorithm: str = "HS256"
) -> Optional[dict]:
    """
    Decode and verify a JWT access token

    Args:
        token: JWT token to decode
        secret_key: Secret key for verification
        algorithm: JWT algorithm

    Returns:
        Decoded token data or None if invalid
    """
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        return payload
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        return None


# ============================================
# API KEY GENERATION
# ============================================
def generate_api_key(length: int = 32) -> str:
    """
    Generate a secure random API key

    Args:
        length: Length of the API key

    Returns:
        Hex-encoded API key
    """
    return secrets.token_hex(length)


def generate_secure_token(length: int = 32) -> str:
    """
    Generate a secure random token

    Args:
        length: Length of the token in bytes

    Returns:
        URL-safe base64-encoded token
    """
    return secrets.token_urlsafe(length)


# ============================================
# CREDENTIAL ENCRYPTION HELPERS
# ============================================
def encrypt_credentials(
    credentials: dict,
    encryption_service: Optional[EncryptionService] = None
) -> dict:
    """
    Encrypt credential dictionary

    Args:
        credentials: Dictionary of credentials
        encryption_service: Encryption service instance

    Returns:
        Dictionary with encrypted credentials
    """
    if encryption_service is None:
        encryption_service = get_encryption_service()

    return encryption_service.encrypt_dict(credentials)


def decrypt_credentials(
    encrypted_credentials: dict,
    encryption_service: Optional[EncryptionService] = None
) -> dict:
    """
    Decrypt credential dictionary

    Args:
        encrypted_credentials: Dictionary of encrypted credentials
        encryption_service: Encryption service instance

    Returns:
        Dictionary with decrypted credentials
    """
    if encryption_service is None:
        encryption_service = get_encryption_service()

    return encryption_service.decrypt_dict(encrypted_credentials)
