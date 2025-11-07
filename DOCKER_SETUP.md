# 🐳 Docker Setup - Complete IIFL Copy Trading Platform

## 🚀 Quick Start (Full Stack)

```bash
# Start the entire platform
docker-compose up -d

# View logs
docker-compose logs -f

# Stop everything
docker-compose down
```

## 🌐 Access Your Platform

After running `docker-compose up -d`, access:

- **🎯 Frontend Dashboard**: http://localhost:3000
- **⚡ Backend API**: http://localhost:8000
- **📊 API Documentation**: http://localhost:8000/docs
- **🗄️ pgAdmin**: http://localhost:5050
- **📈 NATS Monitoring**: http://localhost:8222

## 📦 What's Included

### Complete Container Stack:
1. **PostgreSQL Database** (Port 5432)
2. **Redis Cache** (Port 6379)
3. **NATS Message Queue** (Ports 4222, 8222)
4. **FastAPI Backend** (Port 8000)
5. **React Frontend** (Port 3000)
6. **pgAdmin Database UI** (Port 5050)

## 🔧 Individual Services

### Backend Only
```bash
# Start just the backend infrastructure
docker-compose up db redis nats app -d
```

### Frontend Only (if backend running)
```bash
# Start just the frontend
docker-compose up frontend -d
```

## 🗄️ Database Access

### pgAdmin (Web Interface)
- **URL**: http://localhost:5050
- **Email**: admin@copytrading.com
- **Password**: admin123

### Direct PostgreSQL Connection
```bash
# Connect via Docker
docker exec -it copy_trading_db psql -U trading_user -d copy_trading

# Connect from host
psql -h localhost -p 5432 -U trading_user -d copy_trading
```

## 🔐 Default Credentials

### Database
- **Host**: localhost:5432
- **Database**: copy_trading
- **Username**: trading_user
- **Password**: trading_pass

### pgAdmin
- **Email**: admin@copytrading.com
- **Password**: admin123

## 🛠️ Development Mode

### Frontend Development (Hot Reload)
```bash
# Stop the containerized frontend
docker-compose stop frontend

# Run frontend locally with hot reload
cd frontend
npm run dev
# Now frontend runs at localhost:3000 with live reload
```

### Backend Development
```bash
# Backend already has hot reload enabled in docker-compose
# Edit Python files and they'll auto-reload
```

## 📊 Monitoring & Health Checks

### Service Health
```bash
# Check all services
docker-compose ps

# Check specific service logs
docker-compose logs frontend
docker-compose logs app
docker-compose logs db
```

### NATS Monitoring
- **Dashboard**: http://localhost:8222
- **Check connections, subjects, messages**

### Redis Monitoring
```bash
# Connect to Redis CLI
docker exec -it copy_trading_redis redis-cli
redis> INFO
redis> MONITOR
```

## 🔄 Data Persistence

### Volumes (Data Survives Container Restarts)
- `postgres_data` - Database data
- `redis_data` - Redis cache
- `pgadmin_data` - pgAdmin settings

### Reset All Data
```bash
# Stop and remove everything including volumes
docker-compose down -v

# Restart fresh
docker-compose up -d
```

## 🚀 Production Deployment

### Environment Variables
Create `.env` file:
```env
# Database
DATABASE_URL=postgresql+asyncpg://trading_user:trading_pass@db:5432/copy_trading

# Security
SECRET_KEY=your-production-secret-key-here

# IIFL API (Production)
IIFL_API_URL=https://api.iifl.com/trading/v1
IIFL_API_KEY=your-production-api-key
IIFL_API_SECRET=your-production-api-secret

# Environment
ENVIRONMENT=production
DEBUG=false
```

### Production Build
```bash
# Build for production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 🔧 Troubleshooting

### Port Conflicts
If ports are already in use:
```bash
# Check what's using ports
lsof -i :3000  # Frontend
lsof -i :8000  # Backend
lsof -i :5432  # PostgreSQL

# Change ports in docker-compose.yml if needed
```

### Frontend Not Loading
```bash
# Check frontend logs
docker-compose logs frontend

# Rebuild frontend
docker-compose build frontend
docker-compose up frontend -d
```

### Database Connection Issues
```bash
# Check database health
docker-compose ps db

# Reset database
docker-compose restart db

# View database logs
docker-compose logs db
```

### API Not Responding
```bash
# Check backend logs
docker-compose logs app

# Restart backend
docker-compose restart app
```

## 📈 Production Scaling

### Load Balancing (Multiple Frontend Instances)
```yaml
# In docker-compose.yml
frontend:
  deploy:
    replicas: 3
  ports:
    - "3000-3002:80"
```

### Database Scaling
```yaml
# Add read replicas
db-read:
  image: postgres:15-alpine
  environment:
    POSTGRES_USER: trading_user
    POSTGRES_PASSWORD: trading_pass
    POSTGRES_DB: copy_trading
  command: ["postgres", "-c", "hot_standby=on"]
```

## 🔄 Updates & Maintenance

### Update Application
```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d
```

### Database Migrations
```bash
# Run migrations
docker-compose exec app alembic upgrade head
```

### Backup Database
```bash
# Create backup
docker exec copy_trading_db pg_dump -U trading_user copy_trading > backup.sql

# Restore backup
docker exec -i copy_trading_db psql -U trading_user copy_trading < backup.sql
```

## 🎯 Complete Platform Access

Once everything is running:

1. **Visit http://localhost:3000** - Main application
2. **Login/Register** - Create admin account
3. **Admin Panel** - Manage users and subscriptions
4. **Master Dashboard** - For expert traders
5. **Follower Dashboard** - For subscribers

Your complete copy trading platform is now running in Docker! 🚀