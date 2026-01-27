#!/bin/bash
# Mobile Testing Helper
# Shows your local IP and instructions for Safari Web Inspector testing

# Get local IP (macOS)
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

if [ -z "$LOCAL_IP" ]; then
  echo "Could not detect local IP. Make sure you're connected to WiFi."
  exit 1
fi

echo ""
echo "=== Mobile Testing Setup ==="
echo ""
echo "1. On your iPhone:"
echo "   Settings → Safari → Advanced → Enable 'Web Inspector'"
echo ""
echo "2. On your Mac:"
echo "   Safari → Settings → Advanced → Enable 'Show Develop menu'"
echo ""
echo "3. Open this URL on your iPhone Safari:"
echo "   http://${LOCAL_IP}:3000"
echo ""
echo "4. Connect iPhone via USB cable"
echo ""
echo "5. In Mac Safari menu:"
echo "   Develop → [Your iPhone] → [The webpage]"
echo ""
echo "Starting dev server..."
echo ""
npm run dev
