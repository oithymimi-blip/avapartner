#!/bin/bash
echo "Building frontend..."
cd client && npm install && npm run build
cd ..

echo "Deploying to VPS via rsync..."
rsync -avz -e "ssh -o StrictHostKeyChecking=accept-new" --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude 'build' --exclude 'data.db*' ./ root@avapartner.marketing:/var/www/exchanger/
rsync -avz -e "ssh -o StrictHostKeyChecking=accept-new" client/dist/ root@avapartner.marketing:/var/www/exchanger/client/dist/

echo "Restarting server on VPS..."
ssh -o StrictHostKeyChecking=accept-new root@avapartner.marketing 'cd /var/www/exchanger/server && npm install && pm2 restart exchanger-server'

echo "Deployment complete! (No secrets sent to GitHub)"
