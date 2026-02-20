# Pokemon Card Auto-Buyer - Railway Deployment Script
# Run: powershell -ExecutionPolicy Bypass -File deploy-railway.ps1

Write-Host "Pokemon Card System - Railway Deployment" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# Step 1: Check if Railway CLI is installed
Write-Host "Checking Railway CLI..." -ForegroundColor Yellow
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue

if (-not $railwayInstalled) {
    Write-Host "Railway CLI not found. Please install first:" -ForegroundColor Red
    Write-Host "npm install -g @railway/cli" -ForegroundColor Cyan
    Write-Host "Then rerun this script!" -ForegroundColor Yellow
    exit 1
}

Write-Host "Railway CLI found!" -ForegroundColor Green
Write-Host ""

# Step 2: Login to Railway
Write-Host "Railway Login..." -ForegroundColor Yellow
Write-Host "Opening browser for Railway login..." -ForegroundColor White
railway login

# Step 3: Initialize project
Write-Host ""
Write-Host "Initializing Railway project..." -ForegroundColor Yellow
railway init

# Step 4: Set environment variables
Write-Host ""
Write-Host "Setting environment variables..." -ForegroundColor Yellow

$envVars = @{
    "NODE_ENV" = "production"
    "PORT" = "3001" 
    "JWT_SECRET" = "pokemon-live-secret-2026-secure-key"
    "JWT_EXPIRE" = "30d"
    "ENCRYPTION_KEY" = "pokemon-live-encryption-256-bit-secure-2026"
    "RATE_LIMIT_WINDOW" = "15"
    "RATE_LIMIT_MAX" = "100"
    "AUTO_PURCHASE_ENABLED" = "true"
    "MAX_PURCHASE_AMOUNT" = "500"
    "EMAIL_NOTIFICATIONS" = "false"
    "PURCHASE_SUCCESS_EMAIL" = "false"
}

foreach ($var in $envVars.GetEnumerator()) {
    Write-Host "Setting $($var.Key)..." -ForegroundColor White
    railway variables set "$($var.Key)=$($var.Value)"
}

# Step 5: Deploy
Write-Host ""
Write-Host "Deploying to Railway..." -ForegroundColor Yellow
Write-Host "This will take 2-3 minutes..." -ForegroundColor White
railway up

# Step 6: Get deployment URL
Write-Host ""
Write-Host "Getting deployment URL..." -ForegroundColor Yellow
$deploymentUrl = railway domain

Write-Host ""
Write-Host "DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "====================" -ForegroundColor Green
Write-Host ""
Write-Host "Live URL: $deploymentUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "TEST THESE URLS:" -ForegroundColor Yellow
Write-Host "Health Check: $deploymentUrl/api/health" -ForegroundColor White
Write-Host "Test Purchase: $deploymentUrl/api/purchases/test-purchase" -ForegroundColor White  
Write-Host "Live Scraping: $deploymentUrl/api/purchases/live-test" -ForegroundColor White
Write-Host ""
Write-Host "SHARE WITH CLIENT:" -ForegroundColor Magenta
Write-Host "Main URL: $deploymentUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pokemon Card purchasing system is now LIVE!" -ForegroundColor Green