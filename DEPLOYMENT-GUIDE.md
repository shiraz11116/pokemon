# 🚀 POKEMON CARD SYSTEM - DEPLOYMENT GUIDE

## Option 1: Automated Railway Deployment (RECOMMENDED)

### Prerequisites:
1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Run deployment script:
```powershell
powershell -ExecutionPolicy Bypass -File deploy-railway.ps1
```

## Option 2: Manual Railway Deployment

### Steps:
1. Go to https://railway.app/
2. Login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select "shiraz11116/pokemon"
5. Go to Variables tab and add:
   - NODE_ENV=production
   - PORT=3001
   - JWT_SECRET=pokemon-live-secret-2026-secure-key
   - JWT_EXPIRE=30d
   - ENCRYPTION_KEY=pokemon-live-encryption-256-bit-secure-2026
   - RATE_LIMIT_WINDOW=15
   - RATE_LIMIT_MAX=100
   - AUTO_PURCHASE_ENABLED=true
   - MAX_PURCHASE_AMOUNT=500

6. Click "Deploy"
7. Wait 2-3 minutes
8. Get your live URL!

## Option 3: Alternative Platforms

### Render.com:
- Same process as Railway
- Free 750 hours/month
- https://render.com/

### Cyclic.sh:
- Completely free
- Perfect for Node.js
- https://cyclic.sh/

## Testing URLs (Replace with your actual URL):

- Health Check: `https://your-url.railway.app/api/health`
- Test Purchase: `https://your-url.railway.app/api/purchases/test-purchase`  
- Live Scraping: `https://your-url.railway.app/api/purchases/live-test`

## API Endpoints for Client:

### POST Test Purchase:
```bash
curl -X POST "https://your-url.railway.app/api/purchases/test-purchase" \
  -H "Content-Type: application/json" \
  -d '{"websiteName": "pokemoncenter"}'
```

### POST Live Test:
```bash
curl -X POST "https://your-url.railway.app/api/purchases/live-test" \
  -H "Content-Type: application/json" \
  -d '{"websiteName": "pokemoncenter"}'
```

## System Features:
- ✅ Real Pokemon card purchasing
- ✅ Multi-retailer support (Pokemon Center, Walmart, Target, etc.)
- ✅ Automated price monitoring
- ✅ Live scraping capabilities  
- ✅ Credit card management
- ✅ Purchase history tracking