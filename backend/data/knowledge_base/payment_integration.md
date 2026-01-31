# Payment Gateway Integration Guide

## Overview
This guide covers integrating payment gateways with your store after migration.

## Supported Gateways
- Stripe
- PayPal
- Square
- Braintree
- Adyen

## Stripe Integration

### Initial Setup
1. Log into your Stripe dashboard
2. Get API keys from Developers > API Keys
3. In your store dashboard: Settings > Payments > Add Provider
4. Select Stripe and enter your keys

### Key Types
- **Publishable Key:** `pk_live_*` - Safe for client-side
- **Secret Key:** `sk_live_*` - Server-side only
- **Webhook Secret:** `whsec_*` - For validating webhooks

### Common Issues After Migration

#### Issue: "Invalid API Key" Error
**Causes:**
- Using test keys in production
- Keys not copied correctly
- Need to re-authorize after migration

**Solution:**
1. Go to Stripe Dashboard > Developers > API Keys
2. Copy the live mode keys carefully
3. Re-enter in payment settings
4. Clear payment integration cache

#### Issue: Webhooks Not Working
**Causes:**
- Webhook URL changed after migration
- Webhook secret not updated

**Solution:**
1. Go to Stripe > Webhooks
2. Update endpoint URL to new migration URL
3. Copy new signing secret
4. Update in store settings

### Stripe Webhook Events to Configure
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `customer.subscription.updated`

## PayPal Integration

### Setup Steps
1. Create PayPal developer account
2. Get API credentials (Client ID & Secret)
3. Configure webhooks in PayPal dashboard
4. Add credentials to store settings

### Migration Considerations
- Redirect URLs may need updating
- Webhook endpoints change with new domain
- Test in sandbox before going live

## Handling Failed Payments

### Automatic Retry
We automatically retry failed subscription payments:
- Day 1: First attempt
- Day 3: Second attempt
- Day 5: Third attempt
- Day 7: Final attempt + notify customer

### Manual Recovery
For one-time payments:
1. Customer receives payment failed email
2. Link to update payment method
3. Automatic retry on update

## Testing Payments

### Test Card Numbers (Stripe)
- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Requires Auth: `4000 0025 0000 3155`

### Sandbox Testing
1. Use test/sandbox API keys
2. Use test customer accounts
3. Verify webhook delivery
4. Test refund flows

## Troubleshooting

### Checkout Failing
1. Check payment gateway status page
2. Verify API keys are live (not test)
3. Check for JavaScript errors in console
4. Verify SSL certificate is valid

### Refunds Not Processing
1. Verify refund permissions in gateway
2. Check gateway balance for funds
3. Review refund policies

### Subscription Issues
1. Verify billing integration is active
2. Check customer payment method status
3. Review subscription configuration

## Security Checklist
- [ ] Using HTTPS everywhere
- [ ] API keys stored securely
- [ ] PCI compliance verified
- [ ] Webhook signatures validated
- [ ] Credit card data never logged
