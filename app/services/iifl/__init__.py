"""
IIFL API Integration Module
Contains clients for both Blaze (master) and Normal REST (follower) APIs
"""
from .normal_client import IIFLNormalClient

__all__ = ["IIFLNormalClient"]
