# Replicon - Copy Trading Platform Backend

## 🚀 System Overview

**Replicon** is a production-ready, ultra-low-latency copy-trading platform that mirrors trades from a **MASTER account (IIFL Blaze)** to multiple **FOLLOWER accounts (IIFL Normal REST API)**.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         REPLICON BACKEND                         │
│                                                                   │
│  ┌──────────────┐         ┌─────────────┐       ┌─────────────┐ │
│  │   FastAPI    │────────▶│    NATS     │──────▶│ PostgreSQL  │ │
│  │   Backend    │         │ JetStream   │       │   (Audit)   │ │
│  └──────────────┘         └─────────────┘       └─────────────┘ │
│         │                         │                               │
│         │                         │                               │
│  ┌──────▼──────┐         ┌───────▼────────┐                     │
│  │    Redis    │         │  Order Worker  │                     │
│  │  (Cache)    │         │   (Parallel)   │                     │
│  └─────────────┘         └────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
         │                          │
         │                          │
    ┌────▼──────┐          ┌───────▼────────┐
    │  Blaze    │          │  Normal REST   │
    │ Webhooks  │          │      API       │
    │ (Master)  │          │  (Followers)   │
    └───────────┘          └────────────────┘
         │                          │
         │                          │
    ┌────▼──────────────────────────▼────────┐
    │         IIFL Broker System              │
    └─────────────────────────────────────────┘
```

## 📋 Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Business Logic](#business-logic)
- [Troubleshooting](#troubleshooting)

## ✨ Features

### Core Features
- ✅ **Master Account Management** - Create and manage IIFL Blaze master accounts
- ✅ **Follower Account Management** - Create and manage follower accounts with IIFL Normal REST API
- ✅ **Master-Follower Mapping** - Connect followers to masters with configurable scaling
- ✅ **Real-time Order Replication** - Ultra-low latency order mirroring
- ✅ **Order Lifecycle Management** - NEW, MODIFY, CANCEL operations
- ✅ **Idempotent Processing** - Zero double-trades, zero orphan orders
- ✅ **Comprehensive Audit Logging** - Track all operations
- ✅ **Order Mapping Storage** - Redis (fast) + PostgreSQL (persistent)

### Technical Features
- ⚡ **Event-Driven Architecture** - NATS JetStream for reliable message delivery
- 🔄 **Parallel Execution** - Process multiple followers concurrently
- 🔐 **Encrypted Credentials** - Secure storage of API keys and passwords
- 🛡️ **Retry Mechanisms** - Exponential backoff for API failures
- 📊 **Monitoring Ready** - Prometheus metrics integration
- 🔍 **Comprehensive Logging** - Structured JSON logging

## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend Framework** | FastAPI | High-performance async API |
| **Database** | PostgreSQL + asyncpg | Persistent storage |
| **Cache** | Redis | Order mapping & token cache |
| **Message Queue** | NATS JetStream | Event-driven replication |
| **HTTP Client** | httpx | Connection pooling for IIFL API |
| **Security** | Cryptography, bcrypt | Encryption & password hashing |
| **Validation** | Pydantic | Request/response validation |

## 📦 Installation

### Prerequisites
- Python 3.10+
- PostgreSQL 14+
- Redis 6+
- NATS Server 2.9+ (with JetStream enabled)

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd Replicon
```

### Step 2: Create Virtual Environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### Step 3: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Set Up PostgreSQL
```bash
# Create database
createdb copy_trading

# Run migrations
alembic upgrade head
```

### Step 5: Start Redis
```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally
redis-server
```

### Step 6: Start NATS with JetStream
```bash
# Using Docker
docker run -d -p 4222:4222 nats:latest -js

# Or install locally
nats-server -js
```

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
# Application
APP_NAME="Replicon Copy Trading"
ENVIRONMENT=development
DEBUG=true

# Database
DATABASE_URL=postgresql+asyncpg://trading_user:trading_pass@localhost:5432/copy_trading

# Redis
REDIS_URL=redis://localhost:6379/0

# NATS
NATS_URL=nats://localhost:4222
NATS_STREAM_NAME=REPLICON_ORDERS
NATS_SUBJECT_PREFIX=replicon.orders
NATS_CONSUMER_NAME=order-worker

# Security
SECRET_KEY=super-secret-key-change-this-in-production-123
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALGORITHM=HS256
ENCRYPTION_KEY=  # Auto-generated if empty

# IIFL API Configuration
IIFL_BLAZE_API_URL=https://ttblaze.iifl.com
IIFL_API_URL=https://api.iiflsecurities.com
IIFL_VENDOR_KEY=your_vendor_key
IIFL_VENDOR_CODE=your_vendor_code
IIFL_API_SECRET=your_api_secret

# Performance
HTTP_POOL_CONNECTIONS=100
HTTP_POOL_MAXSIZE=20
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=10
MAX_CONCURRENT_ORDERS=50
ORDER_TIMEOUT_SECONDS=30

# Rate Limiting
IIFL_RATE_LIMIT_PER_SECOND=10
```

## 🗄️ Database Schema

### Core Tables

#### 1. **users** - Master and Follower accounts
```sql
- id (PK)
- username (unique)
- email (unique)
- hashed_password
- role (MASTER/FOLLOWER)
- iifl_account_id
- iifl_user_id
- iifl_password (encrypted)
- iifl_api_key (encrypted)
- balance
- is_active
- created_at
- updated_at
```

#### 2. **follower_relationships** - Master-Follower mappings
```sql
- id (PK)
- master_id (FK -> users)
- follower_id (FK -> users)
- ratio (scaling factor)
- max_order_value
- max_daily_loss
- is_active
- auto_follow
- followed_at
- updated_at
```

#### 3. **orders** - All orders (master & follower)
```sql
- id (PK)
- user_id (FK -> users)
- master_order_id (FK -> orders, NULL for master orders)
- is_master_order
- symbol
- side (BUY/SELL)
- order_type (MARKET/LIMIT/etc)
- quantity
- price
- filled_quantity
- average_price
- status
- broker_order_id (IIFL)
- exchange_order_id
- created_at
- updated_at
```

#### 4. **order_maps** - Master-Follower order mapping (persistent)
```sql
- id (PK)
- master_order_id (FK -> orders)
- master_user_id (FK -> users)
- master_broker_order_id
- follower_order_id (FK -> orders)
- follower_user_id (FK -> users)
- follower_broker_order_id
- scaling_factor
- original_quantity
- follower_quantity
- replication_status (SUCCESS/FAILED)
- replication_latency_ms
- error_message
- created_at
- updated_at
```

#### 5. **audit_logs** - Comprehensive audit trail
```sql
- id (PK)
- action_type (ORDER_CREATED, WEBHOOK_RECEIVED, etc)
- action_description
- user_id (FK -> users)
- master_order_id (FK -> orders)
- request_id
- ip_address
- metadata (JSON)
- success
- error_message
- created_at
```

## 🔌 API Endpoints

### Master Management

```http
POST   /masters                          # Create master account
GET    /masters                          # List all masters
GET    /masters/{master_id}              # Get master details
PUT    /masters/{master_id}              # Update master
DELETE /masters/{master_id}              # Delete master (soft)
```

### Follower Management

```http
POST   /followers                        # Create follower account
GET    /followers                        # List all followers
GET    /followers/{follower_id}          # Get follower details
PUT    /followers/{follower_id}          # Update follower
DELETE /followers/{follower_id}          # Delete follower (soft)
```

### Master-Follower Mapping

```http
POST   /masters/{master_id}/followers                          # Connect follower to master
GET    /masters/{master_id}/followers                          # List master's followers
GET    /followers/{follower_id}/masters                        # List follower's masters
DELETE /masters/{master_id}/followers/{follower_id}            # Disconnect mapping
```

### Webhooks

```http
POST   /webhooks/blaze/order             # Receive Blaze order webhook
GET    /webhooks/health                  # Webhook health check
```

## 🚀 Running the Application

### 1. Start FastAPI Backend
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start Order Worker (in separate terminal)
```bash
python -m app.workers.order_worker
```

### 3. Access API Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🧪 Testing

### Run All Tests
```bash
pytest -v
```

### Run Specific Test
```bash
pytest tests/test_order_mapping.py -v
```

### Test Coverage
```bash
pytest --cov=app --cov-report=html
```

## 📊 Business Logic

### Order Flow

#### 1. **NEW Order**
```
Master places order on Blaze
→ Webhook received by FastAPI
→ Master order created in DB
→ Event published to NATS
→ Worker consumes event
→ For each active follower:
    - Calculate scaled quantity
    - Authenticate with IIFL
    - Place follower order
    - Store mapping (Redis + PostgreSQL)
→ Audit log created
```

#### 2. **MODIFY Order**
```
Master modifies order on Blaze
→ Webhook received
→ Master order updated
→ Event published to NATS
→ Worker retrieves order mapping
→ For each follower order:
    - Modify via IIFL API
    - Update DB
→ Audit log created
```

#### 3. **CANCEL Order**
```
Master cancels order
→ Webhook received
→ Master order marked cancelled
→ Event published to NATS
→ Worker retrieves order mapping
→ For each follower order:
    - Cancel via IIFL API
    - Update status in DB
→ Audit log created
```

### Critical Business Rules

✅ **IDEMPOTENCY** - Same event processed multiple times = same result
✅ **NO DOUBLE TRADES** - Prevent duplicate order execution
✅ **NO ORPHAN ORDERS** - Every follower order mapped to master order
✅ **STRICT MAPPING** - Modify/Cancel only affect existing orders
✅ **ZERO HALLUCINATION** - All API calls use verified IIFL endpoints

## 🛡️ Security Best Practices

1. **Credential Encryption**
   - All IIFL credentials encrypted at rest
   - Separate encryption key per environment

2. **Authentication**
   - JWT tokens for API access
   - Bcrypt for password hashing

3. **API Key Rotation**
   - Encrypt and store API keys
   - Support key rotation without downtime

4. **Audit Logging**
   - Log all sensitive operations
   - Track IP addresses and request IDs

## 🔧 Production Hardening

### 1. Database
- Enable connection pooling (already configured)
- Set up read replicas for analytics
- Regular backups with point-in-time recovery

### 2. Redis
- Enable persistence (AOF + RDB)
- Set up Redis Sentinel for high availability
- Monitor memory usage

### 3. NATS
- Enable authentication
- Set up clustering for fault tolerance
- Monitor stream lag

### 4. Application
- Use gunicorn/uvicorn workers (e.g., 4-8 workers)
- Enable Prometheus metrics
- Set up health checks
- Configure reverse proxy (Nginx/Traefik)

### 5. Monitoring
```python
# Already integrated:
- Prometheus metrics
- Structured JSON logging
- Request tracing with IDs
```

## 🐛 Troubleshooting

### Issue: Worker not receiving events
```bash
# Check NATS connection
nats stream ls
nats stream info REPLICON_ORDERS

# Check consumer
nats consumer ls REPLICON_ORDERS
```

### Issue: Redis connection failed
```bash
# Test Redis
redis-cli ping

# Check Redis URL in .env
```

### Issue: IIFL authentication failed
```bash
# Verify credentials in master/follower account
# Check IIFL API status
# Review audit logs in database
```

### Issue: Order mapping not found
```bash
# Check Redis
redis-cli
> GET order:map:{master_order_id}

# Check PostgreSQL
SELECT * FROM order_maps WHERE master_order_id = {id};
```

## 📚 Further Reading

- [IIFL Blaze API Documentation](https://ttblaze.iifl.com/doc/interactive/)
- [IIFL Normal REST API Documentation](https://api.iiflsecurities.com/index.html)
- [NATS JetStream Guide](https://docs.nats.io/nats-concepts/jetstream)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

## 📄 License

Proprietary - All Rights Reserved

## 🤝 Support

For issues and questions:
1. Check logs: `tail -f logs/replicon.log`
2. Review audit logs in PostgreSQL
3. Check NATS stream status
4. Contact system administrator

---

**Built with ❤️ for high-frequency, low-latency copy trading**
