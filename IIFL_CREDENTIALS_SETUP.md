# 🔐 IIFL API Credentials Setup Guide

## Overview
This guide will help you properly configure your IIFL API credentials for the Copy Trading Platform.

## 📋 Prerequisites
- Active IIFL trading account
- IIFL API access enabled
- Trading permissions on your account

---

## 🚀 Step 1: Obtain IIFL API Credentials

### Where to Get Your Credentials:

1. **Log in to IIFL Trading Platform**
   - Visit: https://www.iifl.com/
   - Login to your trading account

2. **Navigate to API Settings**
   - Go to "Settings" → "API Management"
   - Or contact IIFL support to enable API access

3. **Generate API Credentials**
   - API Key
   - API Secret
   - User ID
   - Password (your trading password)

### Required Information:
```
✅ IIFL_API_KEY       - Your unique API key
✅ IIFL_API_SECRET    - Your API secret (keep this secure!)
✅ IIFL_USER_ID       - Your IIFL user ID
✅ IIFL_PASSWORD      - Your trading account password
✅ IIFL_API_URL       - Usually: https://api.iifl.com/trading/v1
```

---

## 🔧 Step 2: Configure Environment Variables

### Option A: Using .env File (Recommended)

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit .env file with your credentials:**
   ```bash
   # IIFL API CREDENTIALS
   IIFL_API_URL=https://api.iifl.com/trading/v1
   IIFL_API_KEY=YOUR_ACTUAL_API_KEY_HERE
   IIFL_API_SECRET=YOUR_ACTUAL_API_SECRET_HERE
   IIFL_USER_ID=YOUR_ACTUAL_USER_ID_HERE
   IIFL_PASSWORD=YOUR_ACTUAL_PASSWORD_HERE
   ```

### Option B: System Environment Variables

```bash
export IIFL_API_KEY="your_api_key"
export IIFL_API_SECRET="your_api_secret"
export IIFL_USER_ID="your_user_id"
export IIFL_PASSWORD="your_password"
export IIFL_API_URL="https://api.iifl.com/trading/v1"
```

### Option C: Docker Environment Variables

In your `docker-compose.yml`:
```yaml
environment:
  - IIFL_API_KEY=your_api_key
  - IIFL_API_SECRET=your_api_secret
  - IIFL_USER_ID=your_user_id
  - IIFL_PASSWORD=your_password
  - IIFL_API_URL=https://api.iifl.com/trading/v1
```

---

## 🔐 Step 3: Security Best Practices

### ⚠️ NEVER COMMIT CREDENTIALS TO GIT!

1. **Ensure .env is in .gitignore:**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use different credentials for different environments:**
   - Development: Test account credentials
   - Production: Real trading account credentials

3. **Restrict API permissions:**
   - Only enable required permissions in IIFL API settings
   - Consider separate API keys for different applications

4. **Rotate credentials regularly:**
   - Change API secrets every 3-6 months
   - Immediately rotate if compromised

---

## 📝 Step 4: Test Account Setup (Recommended)

### For Development & Testing:

1. **Request IIFL Test Account:**
   - Contact IIFL support for sandbox/test account
   - Use test credentials during development

2. **Test API Connection:**
   ```bash
   # Start the platform
   docker-compose up -d

   # Check health
   curl http://localhost:8000/health
   ```

3. **Verify API Integration:**
   - Register a test user
   - Link IIFL account ID
   - Place a small test order

---

## 🎯 Step 5: User Account Linking

### Each user needs to link their IIFL account:

1. **User Registration:**
   ```bash
   curl -X POST http://localhost:8000/api/users/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "username": "testuser",
       "password": "SecurePass123!",
       "role": "MASTER"
     }'
   ```

2. **Login and Get Token:**
   ```bash
   curl -X POST http://localhost:8000/api/users/login \
     -H "Content-Type: application/json" \
     -d '{
       "username": "testuser",
       "password": "SecurePass123!"
     }'
   ```

3. **Link IIFL Account:**
   ```bash
   curl -X PUT http://localhost:8000/api/users/me \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "iifl_account_id": "YOUR_IIFL_ACCOUNT_ID",
       "iifl_user_id": "YOUR_IIFL_USER_ID"
     }'
   ```

---

## 🚨 Step 6: Troubleshooting

### Common Issues:

1. **"Invalid API Key" Error:**
   - Verify API key is correct
   - Check if API access is enabled in IIFL account
   - Ensure no extra spaces in credentials

2. **"Authentication Failed" Error:**
   - Verify user ID and password
   - Check if account is active
   - Ensure 2FA is properly configured

3. **"Insufficient Permissions" Error:**
   - Contact IIFL to enable trading API permissions
   - Verify account has required trading limits

4. **"Connection Timeout" Error:**
   - Check internet connectivity
   - Verify IIFL API URL is correct
   - Check if IIFL services are operational

### Test Connection Script:
```python
# test_iifl_connection.py
import asyncio
from app.services.iifl_client import get_iifl_client

async def test_connection():
    client = get_iifl_client()
    try:
        # Test authentication
        balance = await client.get_account_balance("your_account_id")
        print("✅ IIFL API connection successful!")
        print(f"Account balance: {balance}")
    except Exception as e:
        print(f"❌ IIFL API connection failed: {e}")
    finally:
        await client.close()

# Run test
asyncio.run(test_connection())
```

---

## 📞 Support

### If you encounter issues:

1. **IIFL API Support:**
   - Email: apisupport@iifl.com
   - Phone: +91-22-4646-4600

2. **Platform Issues:**
   - Check logs: `docker-compose logs -f app`
   - Enable debug mode in .env: `DEBUG=true`

3. **Documentation:**
   - IIFL API Docs: https://www.iifl.com/api-documentation
   - Platform README: ./README.md

---

## ✅ Verification Checklist

- [ ] IIFL API credentials obtained
- [ ] .env file configured with real credentials
- [ ] .env file added to .gitignore
- [ ] Test connection successful
- [ ] Users can register and login
- [ ] IIFL account linking works
- [ ] Test order placement successful

---

## 🎉 Next Steps

Once credentials are configured:

1. **Start the platform:** `docker-compose up -d`
2. **Register users:** Master and follower accounts
3. **Set up follow relationships**
4. **Test order replication with small quantities**
5. **Scale to your target user base**

**Your Copy Trading Platform is now ready! 🚀**