# 🚀 NAMECHEAP SERVER SETUP - COMPLETE GUIDE

## Step 1: System Update
```bash
sudo apt update && sudo apt upgrade -y
```

## Step 2: Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

## Step 3: Install Dependencies
```bash
sudo apt install -y git nginx chromium-browser build-essential
sudo npm install -g pm2
```

## Step 4: Clone Your Project
```bash
cd /var/www
sudo git clone https://github.com/shiraz11116/pokemon.git
sudo chown -R $USER:$USER pokemon/
cd pokemon
pwd
```

## Step 5: Install Project Dependencies
```bash
npm install
cd pokemon-dashboard && npm install && npm run build && cd ..
ls pokemon-dashboard/build/
```

## Step 6: Create Environment File
```bash
cat > .env << 'EOF'
PORT=3001
NODE_ENV=production
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
EOF
```

## Step 7: Start Application with PM2
```bash
pm2 start server.js --name pokemon-system
pm2 startup
pm2 save
pm2 status
```

## Step 8: Test API
```bash
curl http://localhost:3001/api/health
```

## Step 9: Configure NGINX
```bash
sudo tee /etc/nginx/sites-available/pokemon > /dev/null << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

## Step 10: Enable NGINX Site
```bash
sudo ln -s /etc/nginx/sites-available/pokemon /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

## Step 11: Final Verification
```bash
pm2 status
curl http://localhost/api/health
sudo systemctl status nginx
```

## ✅ SUCCESS INDICATORS:
- pm2 status shows 'online'
- curl returns JSON response
- nginx -t says 'test is successful'

## 🌐 ACCESS YOUR SYSTEM:
- Dashboard: http://YOUR_SERVER_IP/
- API: http://YOUR_SERVER_IP/api/health
- With Domain: http://YOUR_DOMAIN.com/

## ⚠️ IMPORTANT:
Replace YOUR_DOMAIN.com in Step 9 with your actual domain name!

## ⏱️ TOTAL TIME: 15-20 minutes