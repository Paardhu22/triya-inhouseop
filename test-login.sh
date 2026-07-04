#!/bin/bash
# Get CSRF token
OUTPUT=$(curl -s -c cookies.txt -H "ngrok-skip-browser-warning: 1" "https://lily-headfirst-player.ngrok-free.dev/api/auth/csrf")
CSRF_TOKEN=$(echo $OUTPUT | grep -o '"csrfToken":"[^"]*' | cut -d'"' -f4)

echo "CSRF Token: $CSRF_TOKEN"

# Attempt login
curl -i -s -b cookies.txt -c cookies.txt \
  -H "ngrok-skip-browser-warning: 1" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=${CSRF_TOKEN}&email=admin@triya.local&password=Admin@12345&redirect=false" \
  "https://lily-headfirst-player.ngrok-free.dev/api/auth/callback/credentials"
