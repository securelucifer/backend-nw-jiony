#!/bin/bash

###############################################
# DM BACKEND DEPLOYMENT WITH DOMAIN + HTTPS
# VPS: 184.168.125.239 | Internal Port: 4009
###############################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_step() { echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n$1\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

VPS_IP="184.168.125.239"
APP_NAME="jio-backend"
APP_PORT="6009"
PROJECT_ROOT="/www/wwwroot/${APP_NAME}"
BACKEND_REPO="https://github.com/securelucifer/backend-nw-jiony.git"

DOMAIN="dmartdeals.com.tr"
EMAIL="you@example.com"

MONGO_URL="mongodb+srv://hostlokisingh_db_user:afDKVQbniA8wUVfD@cluster0.dssudhe.mongodb.net/?appName=Cluster0"
ADMIN_USER="adminJio"
ADMIN_PASS="adminjio123"
JWT_SECRET="SKFJFKU57AWWWLOQPERURIUFNBGU"
JWT_EXPIRE="5d"
COOKIE_EXPIRE="5"
DELETE_PASSWORD="matrix"

clear
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         🚀 DM BACKEND DEPLOYMENT + HTTPS            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  🌐 VPS IP:         ${VPS_IP}"
echo "  🌍 Domain:         ${DOMAIN}"
echo "  🔌 Internal Port:  ${APP_PORT}"
echo "  📁 Project Root:   ${PROJECT_ROOT}"
echo ""
read -p "Press Enter to deploy DM backend with domain..."

print_step "🧹 [1/7] CLEANUP"
pm2 delete ${APP_NAME} 2>/dev/null || true
pm2 save >/dev/null 2>&1 || true
rm -rf ${PROJECT_ROOT}
mkdir -p ${PROJECT_ROOT}
chown -R $(whoami):$(whoami) ${PROJECT_ROOT}
print_success "Cleanup complete"

print_step "📦 [2/7] CHECK SYSTEM"
apt update -y
command -v curl >/dev/null 2>&1 || apt install -y curl
command -v git >/dev/null 2>&1 || apt install -y git
command -v nginx >/dev/null 2>&1 || apt install -y nginx
command -v node >/dev/null 2>&1 || { print_error "Node.js missing"; exit 1; }
command -v npm >/dev/null 2>&1 || { print_error "npm missing"; exit 1; }
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
command -v certbot >/dev/null 2>&1 || apt install -y certbot python3-certbot-nginx
print_success "System check passed"

print_step "📦 [3/7] DEPLOY BACKEND"
cd ${PROJECT_ROOT} || exit 1
git clone ${BACKEND_REPO} . || { print_error "Repo clone failed"; exit 1; }
npm install --production || { print_error "npm install failed"; exit 1; }

cat > .env << EOF
PORT=${APP_PORT}
MONGO_URL=${MONGO_URL}
ADMIN_USER=${ADMIN_USER}
ADMIN_PASS=${ADMIN_PASS}
JWT_EXPIRE=${JWT_EXPIRE}
COOKIE_EXPIRE=${COOKIE_EXPIRE}
NODE_ENV=Production
JWT_SECRET=${JWT_SECRET}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
DELETE_PASSWORD=${DELETE_PASSWORD}
CORS_ORIGIN=https://${DOMAIN}
EOF

ENTRY=""
if [ -f "app.js" ]; then
    ENTRY="app.js"
elif [ -f "server.js" ]; then
    ENTRY="server.js"
elif [ -f "index.js" ]; then
    ENTRY="index.js"
elif [ -f "src/server.js" ]; then
    ENTRY="src/server.js"
elif [ -f "src/index.js" ]; then
    ENTRY="src/index.js"
else
    print_error "No entry point found"
    ls -la
    exit 1
fi

print_info "Starting PM2 with entry file: ${ENTRY}"
pm2 start ${ENTRY} --name "${APP_NAME}" --time --cwd ${PROJECT_ROOT}
pm2 save
sleep 5
print_success "Backend started on port ${APP_PORT}"

print_step "🌐 [4/7] CONFIGURE NGINX"
cat > /etc/nginx/sites-available/${APP_NAME} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
rm -f /etc/nginx/sites-enabled/default
nginx -t || { print_error "Nginx config failed"; exit 1; }
systemctl restart nginx
print_success "Nginx reverse proxy configured"

print_step "🔐 [5/7] ENABLE HTTPS"
print_warning "Make sure Cloudflare DNS A record for ${DOMAIN} points to ${VPS_IP}"
print_warning "For Certbot HTTP validation, temporarily set Cloudflare proxy to DNS only (grey cloud)"
read -p "Press Enter after DNS is ready..."

certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${EMAIL} --redirect || {
    print_error "SSL setup failed. Check DNS and Cloudflare proxy mode."
    exit 1
}
systemctl reload nginx
print_success "HTTPS enabled"

print_step "🧪 [6/7] VERIFY"
curl -I http://127.0.0.1:${APP_PORT}/api/ping || true
curl -I http://${DOMAIN}/api/ping || true
curl -I https://${DOMAIN}/api/ping || true
pm2 logs ${APP_NAME} --lines 20 --nostream || true

print_step "✅ [7/7] DONE"
echo ""
print_success "DM BACKEND LIVE WITH HTTPS"
echo "API Base : https://${DOMAIN}/api"
echo "Ping     : https://${DOMAIN}/api/ping"
echo "Socket   : https://${DOMAIN}/socket.io"
echo ""
echo 'Use in APK:'
echo "export const API_URL = 'https://${DOMAIN}/api';"
echo ""
pm2 list



nano /root/deploy-jio-app.sh
bash /root/deploy-jio-app.sh
chmod +x /root/deploy-jio-app.sh