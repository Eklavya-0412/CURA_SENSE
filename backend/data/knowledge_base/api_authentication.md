# API Authentication Guide

## Overview
Our API uses OAuth 2.0 for authentication. This guide covers setting up and maintaining API access.

## Authentication Methods

### 1. API Keys (Simple)
Best for server-to-server integrations.

```
Authorization: Bearer sk_live_xxxxxxxxxxxxx
```

**Key Types:**
- `sk_live_*` - Production (live data)
- `sk_test_*` - Sandbox (test data)

### 2. OAuth 2.0 (Recommended)
Best for apps that act on behalf of merchants.

## Token Lifecycle

### Access Token
- **Expiry:** 1 hour (3600 seconds)
- **Use:** Include in Authorization header
- **Refresh:** Use refresh token before expiry

### Refresh Token
- **Expiry:** 30 days
- **Use:** Exchange for new access token
- **Storage:** Store securely (encrypted)

## Token Refresh Flow

```python
import requests

def refresh_access_token(refresh_token, client_id, client_secret):
    response = requests.post(
        "https://api.platform.com/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret
        }
    )
    return response.json()
```

**Best Practice:** Refresh 5 minutes before expiry to avoid request failures.

## Scopes

| Scope | Description |
|-------|-------------|
| `read_products` | Read product data |
| `write_products` | Create/update products |
| `read_orders` | Read order data |
| `write_orders` | Create/update orders |
| `read_customers` | Read customer data |
| `write_customers` | Create/update customers |
| `admin` | Full access (use sparingly) |

## Common Errors

### 401 Unauthorized
- Token expired
- Invalid token format
- Token revoked

**Solution:** Check token validity, refresh if needed

### 403 Forbidden
- Missing required scope
- Resource access denied
- Rate limit exceeded

**Solution:** Verify token scopes, check rate limits

### 429 Too Many Requests
- Rate limit exceeded

**Solution:** Implement exponential backoff

## Rate Limits

| Tier | Requests/Minute |
|------|-----------------|
| Basic | 100 |
| Pro | 500 |
| Enterprise | 1000 |

**Headers:**
- `X-RateLimit-Limit` - Max requests
- `X-RateLimit-Remaining` - Requests left
- `X-RateLimit-Reset` - Reset timestamp

## Security Best Practices

1. **Never expose keys in client code**
2. **Rotate keys periodically**
3. **Use minimum required scopes**
4. **Store tokens encrypted**
5. **Monitor API usage for anomalies**
6. **Revoke unused tokens**

## Migration Notes

When migrating from our old API:
1. Generate new API keys (old keys don't work)
2. Update OAuth endpoints
3. Review scope requirements (may have changed)
4. Token expiry changed from 24h to 1h
5. Use refresh tokens for long-running processes
