export const PLAN_PRICE = {
  standard: '35',
  pro: '99',
  premium: '199',
}

export const PLAN_MARKETING_DISPLAY = {
  standard: 'Standard',
  pro: 'grow',
  premium: 'PREMIUM',
}

export const PLAN_UI_DISPLAY = {
  standard: 'STANDARD',
  pro: 'GROW',
  premium: 'PREMIUM',
}

export const getMarketingPricingPlans = (t) => ([
  {
    name: PLAN_MARKETING_DISPLAY.standard,
    price: `$${PLAN_PRICE.standard}`,
    popular: false,
    features: [
      t('pf_standard_1'),
      t('pf_standard_2'),
      t('pf_standard_3'),
      t('pf_standard_4'),
      t('pf_standard_5'),
      t('pf_standard_6'),
    ],
    cta: t('pf_standard_cta'),
    plan_id: 'standard',
    highlight: false,
  },
  {
    name: PLAN_MARKETING_DISPLAY.pro,
    price: `$${PLAN_PRICE.pro}`,
    popular: true,
    features: [
      t('pf_pro_1'),
      t('pf_pro_2'),
      t('pf_pro_3'),
      t('pf_pro_4'),
      t('pf_pro_5'),
      t('pf_pro_6'),
      t('pf_pro_7'),
      t('pf_pro_8'),
    ],
    cta: t('pf_pro_cta'),
    plan_id: 'pro',
    highlight: true,
  },
  {
    name: PLAN_MARKETING_DISPLAY.premium,
    price: `$${PLAN_PRICE.premium}`,
    popular: false,
    features: [
      t('pf_premium_1'),
      t('pf_premium_2'),
      t('pf_premium_3'),
      t('pf_premium_4'),
      t('pf_premium_5'),
      t('pf_premium_6'),
      t('pf_premium_7'),
      t('pf_premium_8'),
      t('pf_premium_9'),
    ],
    cta: t('pf_premium_cta'),
    plan_id: 'premium',
    highlight: false,
  },
])

export const getPlanUiLabel = (plan) => PLAN_UI_DISPLAY[String(plan || '').toLowerCase()] || '—'