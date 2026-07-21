# NovaNet ISP portal demo

Run this local demo with Node.js 18 or newer:

```powershell
node server.js
```

Then open `http://localhost:3000`.

The demo has a small API for checkout (`POST /api/checkout`) and admin data (`GET /api/admin`). It intentionally does **not** process real card data.

## Razorpay test integration

1. Create a Razorpay account and obtain **test** Key ID and Key Secret.
2. In PowerShell, set them for the current terminal before running the app:

```powershell
$env:RAZORPAY_KEY_ID="rzp_test_..."
$env:RAZORPAY_KEY_SECRET="..."
$env:RAZORPAY_WEBHOOK_SECRET="a-long-unique-secret"
node server.js
```

3. Use Razorpay test cards/UPI only while testing. Never put secrets in `app.js`, `index.html`, or source control.
4. When deployed on an HTTPS domain, configure Razorpay to call `https://your-domain.com/api/webhooks/razorpay` and verify the webhook secret server-side.

For live service, replace the in-memory records with a production database and invoke the ISP billing/provisioning API only after payment verification. The server creates orders with amounts from its fixed plan catalogue; it does not trust an amount supplied by the browser.
