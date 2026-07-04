#!/bin/bash
curl -i -s -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@triya.local\",\"password\":\"Admin@12345\",\"redirect\":false}" \
  "https://lily-headfirst-player.ngrok-free.dev/api/auth/callback/credentials"
