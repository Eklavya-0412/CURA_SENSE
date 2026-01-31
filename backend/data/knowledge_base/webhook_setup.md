# Webhook Setup Guide

## Overview
Webhooks allow your application to receive real-time notifications about events in your store.

## Prerequisites
- A publicly accessible HTTPS endpoint
- SSL certificate (self-signed not accepted)
- Ability to respond within 30 seconds

## Setup Steps

### 1. Create Your Endpoint
Your webhook endpoint must:
- Accept POST requests
- Respond with 2xx status within 30 seconds
- Be publicly accessible (no localhost)
- Use HTTPS (HTTP endpoints are rejected)

### 2. Register Webhook in Dashboard
1. Go to Settings > Webhooks
2. Click "Add Webhook"
3. Enter your endpoint URL
4. Select events to subscribe to
5. Copy the signing secret

### 3. Verify Webhook Signature
All webhooks include a signature header `X-Webhook-Signature`.

```python
import hmac
import hashlib

def verify_signature(payload, signature, secret):
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Event Types
- `order.created` - New order placed
- `order.updated` - Order status changed
- `order.fulfilled` - Order shipped
- `product.created` - New product added
- `product.updated` - Product modified
- `customer.created` - New customer registered

## Retry Policy
Failed deliveries are retried:
- 1st retry: 5 minutes
- 2nd retry: 30 minutes
- 3rd retry: 2 hours
- Final retry: 24 hours

After 4 failed attempts, the webhook is disabled and you'll receive an email notification.

## Troubleshooting

### Webhooks Not Arriving
1. **Check endpoint accessibility** - Use a tool like webhook.site to test
2. **Verify SSL certificate** - Must be valid, not self-signed
3. **Whitelist our IPs** - 192.168.1.0/24, 10.0.0.0/8
4. **Check response time** - Must respond within 30 seconds

### Delayed Webhooks
- High volume periods may cause delays
- Check our status page for incidents
- Ensure your endpoint responds quickly

### Missing Events
- Verify event type is subscribed
- Check webhook is enabled in dashboard
- Review webhook logs in admin panel

## Best Practices
1. Respond quickly, process async
2. Implement idempotency (we may retry)
3. Log all incoming webhooks
4. Handle unknown event types gracefully
5. Use queue for heavy processing
