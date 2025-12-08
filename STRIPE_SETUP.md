# Stripe Integration Setup

## Quick Start

Your landing page is now live with pricing buttons! Follow these steps to make them actually work.

### Step 1: Create Stripe Payment Links

1. Go to **[Stripe Dashboard](https://dashboard.stripe.com)**
2. Navigate to **Products** → **Payment Links**
3. Create 3 new payment links for your plans:

#### Plan 1: Starter (€99/month)
- **Name:** ShopBrain AI Starter
- **Price:** €99.00
- **Recurring:** Monthly
- **Copy the link**

#### Plan 2: Pro (€199/month)
- **Name:** ShopBrain AI Pro
- **Price:** €199.00
- **Recurring:** Monthly
- **Copy the link**

#### Plan 3: Enterprise (€299/month)
- **Name:** ShopBrain AI Enterprise
- **Price:** €299.00
- **Recurring:** Monthly
- **Copy the link**

### Step 2: Update App.jsx

Edit `frontend/src/App.jsx` and replace the STRIPE_LINKS object:

```javascript
const STRIPE_LINKS = {
  starter: 'https://buy.stripe.com/YOUR_ACTUAL_STARTER_LINK',
  pro: 'https://buy.stripe.com/YOUR_ACTUAL_PRO_LINK',
  enterprise: 'https://buy.stripe.com/YOUR_ACTUAL_ENTERPRISE_LINK'
}
```

### Step 3: Test & Deploy

1. Commit the changes:
   ```bash
   git add frontend/src/App.jsx
   git commit -m "Add Stripe payment links"
   git push origin main
   ```

2. GitHub Pages will auto-deploy within 2 minutes
3. Visit your site and click a pricing button to test!

## Button Functionality

✅ **Pricing Buttons**: Redirect to Stripe Checkout (after you add links)
✅ **Se connecter**: Opens magic-link auth modal via Supabase
✅ **Enterprise "Contacter sales"**: Opens auth modal so you can collect leads
✅ **All navigation links**: Smooth scroll to sections

## Testing Payments

Use these **test card numbers** with Stripe:
- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **CVC:** Any 3 digits
- **Date:** Any future date

## What's Next

After users buy:
1. Stripe sends webhook to your backend
2. Backend creates Shopify OAuth session
3. User sees dashboard to connect their Shopify store
4. AI starts analyzing their products

(We'll build the post-login flow next!)
