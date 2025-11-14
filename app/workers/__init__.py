"""
Workers module for background processing
Contains order worker for processing NATS events
"""
from .order_worker import OrderWorker

__all__ = ["OrderWorker"]
