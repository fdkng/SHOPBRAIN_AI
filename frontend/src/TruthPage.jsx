import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from './LanguageContext'
import { supabase } from './supabaseClient'

const API_URL = 'https://shopbrain-backend.onrender.com'
const RANGE_OPTIONS = ['7d', '30d', '90d']

const formatCurrency = (value, locale = 'en-US') => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric)
}

const formatPercent = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return `${Math.round(numeric)}%`
}

const formatDateTime = (value, locale = 'en-US') => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale)
}

const ArrowLeftIcon = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
const AlertCircleIcon = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
const CheckCircleIcon = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"></path><circle cx="12" cy="12" r="10"></circle></svg>
const RefreshIcon = ({ className = 'w-4 h-4' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"></path></svg>

export default function TruthPage() {
  const { t, language } = useTranslation()
  const locale = language === 'fr' ? 'fr-FR' : 'en-US'
  const tr = useCallback((key, fallback) => {
    const translated = t(key)
    return translated === key && fallback ? fallback : translated
  }, [t])

  const [data, setData] = useState(null)
  const [rangeValue, setRangeValue] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const navigateToDashboard = useCallback(() => {
    window.location.hash = '#dashboard'
  }, [])

  const openDashboardTab = useCallback((tab) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboardRouteTab', tab)
    }
    window.location.hash = '#dashboard'
  }, [])

  const loadTruth = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError('')

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session
      if (!session?.access_token) {
        throw new Error(tr('authSessionExpired', 'Session expired'))
      }

      const response = await fetch(`${API_URL}/api/truth/dashboard?range=${rangeValue}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`)
      }

      setData(payload)
    } catch (err) {
      setError(err?.message || tr('truthLoadError', 'Unable to load Truth Engine'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [rangeValue, tr])

  useEffect(() => {
    loadTruth()
  }, [loadTruth])

  const truthView = useMemo(() => {
    const summary = data?.summary || {}
    const profitEngine = data?.profit_engine || {}
    const systemFlags = data?.system_flags || {}
    const truthBlock = data?.truth_block || {}
    const sourceStatus = data?.data_sources_status || {}

    const sourceCards = Object.entries(sourceStatus).map(([key, source]) => ({
      key,
      label: source?.name || key,
      connected: Boolean(source?.connected),
      completeness: Number(source?.completeness || 0),
      reliability: Number(source?.reliability || 0),
      source: source?.source || '',
      lastSync: source?.last_sync || null,
      error: source?.error || '',
    }))

    const metricTone = (value, positive = true) => {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'text-[#8A8AA3]'
      if (!positive) return 'text-[#FF6B35]'
      return Number(value) >= 0 ? 'text-[#0D9488]' : 'text-[#DC2626]'
    }

    const financialRows = [
      {
        key: 'revenue',
        badge: 'Shopify',
        label: tr('truthRevenueReal', 'Revenue'),
        value: summary.total_revenue_real,
        available: summary.total_revenue_real !== null && summary.total_revenue_real !== undefined,
        tone: metricTone(summary.total_revenue_real, true),
      },
      {
        key: 'spend',
        badge: 'Ads',
        label: tr('truthSpendReal', 'Ad Spend'),
        value: summary.total_ad_spend,
        available: summary.total_ad_spend !== null && summary.total_ad_spend !== undefined,
        tone: metricTone(summary.total_ad_spend, false),
      },
      {
        key: 'cogs',
        badge: systemFlags?.cost_inputs?.cogs_present ? tr('truthVerifiedInput', 'Verified input') : tr('truthMissingInput', 'Missing'),
        label: tr('truthCogs', 'COGS'),
        value: summary.total_cogs,
        available: summary.total_cogs !== null && summary.total_cogs !== undefined,
        tone: metricTone(summary.total_cogs, true),
      },
      {
        key: 'fees',
        badge: systemFlags?.cost_inputs?.fees_present ? tr('truthVerifiedInput', 'Verified input') : tr('truthMissingInput', 'Missing'),
        label: tr('truthFees', 'Fees'),
        value: summary.total_fees,
        available: summary.total_fees !== null && summary.total_fees !== undefined,
        tone: metricTone(summary.total_fees, true),
      },
    ]

    return {
      summary,
      profitEngine,
      truthScore: Number(data?.truth_score?.value || 0),
      truthLabel: data?.truth_score?.label || 'UNVERIFIED',
      truthBlocked: truthBlock.allowed === false,
      truthBlockReason: truthBlock.reason || '',
      missingSources: truthBlock.missing_sources || [],
      insights: Array.isArray(data?.insights) ? data.insights : [],
      alerts: Array.isArray(data?.alerts) ? data.alerts : [],
      anomalies: Array.isArray(data?.anomalies) ? data.anomalies : [],
      campaigns: Array.isArray(data?.campaigns) ? data.campaigns : [],
      sourceCards,
      financialRows,
      dataCompleteness: Number(data?.data_completeness || systemFlags?.data_completeness || 0),
      metricMode: systemFlags?.metric_mode || 'hidden',
    }
  }, [data, tr])

  const getCampaignActionLabel = useCallback((campaign) => {
    const roas = Number(campaign?.roas_real)
    const errorPercent = Math.abs(Number(campaign?.error_percent || 0))
    if (!Number.isFinite(roas)) return tr('truthActionConnect', 'Connect source')
    if (roas < 1) return tr('truthActionReduce', 'Reduce budget')
    if (errorPercent >= 20) return tr('truthActionTracking', 'Check tracking')
    if (roas > 2) return tr('truthActionScale', 'Scale carefully')
    return tr('truthActionDetails', 'Open details')
  }, [tr])

  const handleCampaignAction = useCallback((campaign) => {
    const roas = Number(campaign?.roas_real)
    const errorPercent = Math.abs(Number(campaign?.error_percent || 0))
    if (!Number.isFinite(roas) || errorPercent >= 20) {
      openDashboardTab('integrations')
      return
    }
    if (roas < 1) {
      openDashboardTab('underperforming')
      return
    }
    openDashboardTab('overview')
  }, [openDashboardTab])

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E8E8EE] border-t-[#FF6B35] rounded-full animate-spin" />
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#1A1A2E] selection:bg-[#FF6B35]/20">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-[#E8E8EE]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <button onClick={navigateToDashboard} className="p-2 rounded-full hover:bg-[#F3F4F6] transition-colors text-[#6A6A85] hover:text-[#1A1A2E]">
              <ArrowLeftIcon />
            </button>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8A8AA3] font-semibold">TRUTH</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <h1 className="text-2xl font-bold text-[#1A1A2E]">{tr('truthTitle', 'Real Profit Dashboard')}</h1>
                <span className="inline-flex items-center rounded-full bg-[#F1F5F9] text-[#0F172A] px-3 py-1 text-xs font-semibold border border-[#E2E8F0]">
                  {truthView.truthLabel} · {truthView.truthScore}%
                </span>
              </div>
              <p className="text-sm text-[#6A6A85] mt-1 max-w-3xl">{tr('truthDashboardCta', 'Open the source-of-truth view to compare real Shopify revenue, ad spend and UTM attribution in one dedicated page.')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[#E8E8EE] bg-white p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => setRangeValue(option)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${rangeValue === option ? 'bg-[#1A1A2E] text-white' : 'text-[#6A6A85] hover:bg-[#F7F8FA]'}`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadTruth({ silent: true })}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 px-4 py-2.5 rounded-xl text-white font-semibold text-sm"
            >
              <RefreshIcon className={refreshing ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
              {refreshing ? tr('refreshing', 'Refreshing...') : tr('refreshConnections', 'Refresh statuses')}
            </button>
            <button onClick={() => openDashboardTab('integrations')} className="inline-flex items-center justify-center bg-white hover:bg-[#F7F8FA] px-4 py-2.5 rounded-xl text-[#1A1A2E] font-semibold text-sm border border-[#E8E8EE]">
              {tr('truthBackDashboard', 'Back to dashboard')}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
          <div className="rounded-3xl border border-[#E8E8EE] bg-gradient-to-br from-[#1A1A2E] via-[#20203A] to-[#0F172A] p-6 md:p-8 text-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${truthView.truthBlocked ? 'bg-red-500/10 border-red-500/20 text-red-200' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'}`}>
                <span className={`w-2 h-2 rounded-full ${truthView.truthBlocked ? 'bg-red-300' : 'bg-emerald-300'}`} />
                {truthView.truthBlocked ? tr('truthModeHidden', 'Profit hidden') : tr('truthModeVerified', 'Verified metrics')}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
                {truthView.summary?.orders_count ?? 0} orders · {truthView.summary?.campaign_count ?? 0} campaigns
              </span>
            </div>

            <p className="text-sm uppercase tracking-[0.2em] text-white/40 mb-3">{tr('truthProfitEngine', 'Profit Engine')}</p>
            <div className={`text-4xl md:text-6xl font-extrabold tracking-tight ${Number(truthView.profitEngine?.value) >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'}`}>
              {truthView.profitEngine?.value === null || truthView.profitEngine?.value === undefined ? tr('truthMetricHidden', 'Hidden') : formatCurrency(truthView.profitEngine.value, locale)}
            </div>
            <p className="text-white/70 text-base mt-4 max-w-3xl">
              {truthView.profitEngine?.warning || tr('truthSourceNote', 'Source of truth: Shopify orders + UTM attribution + connected ad spend')}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
              {[
                { label: tr('truthScoreTitle', 'Truth Score'), value: `${truthView.truthScore}%` },
                { label: tr('truthRealRoas', 'Real ROAS'), value: truthView.summary?.real_roas ? `${Number(truthView.summary.real_roas).toFixed(2)}x` : '—' },
                { label: tr('truthDataCoverage', 'Data coverage'), value: formatPercent(truthView.dataCompleteness) },
                { label: tr('truthConnected', 'Connected'), value: `${truthView.sourceCards.filter((card) => card.connected).length}/${truthView.sourceCards.length}` },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/45">{card.label}</p>
                  <p className="text-2xl font-bold mt-2">{card.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[#E8E8EE] bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8A8AA3] font-semibold">AI</p>
                <h2 className="text-xl font-bold text-[#1A1A2E] mt-1">{tr('truthInsightsTitle', 'Insights')}</h2>
              </div>
              <button onClick={() => openDashboardTab('integrations')} className="text-sm font-semibold text-[#FF6B35] hover:text-[#E85A28]">
                {tr('connectionsTitle', 'Connections')}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {truthView.insights.length > 0 ? truthView.insights.slice(0, 3).map((insight, index) => (
                <div key={`${insight.problem}-${index}`} className="rounded-2xl border border-[#E8E8EE] bg-[#F7F8FA] p-4 space-y-2">
                  <p className="font-semibold text-[#1A1A2E]">{insight.problem}</p>
                  <p className="text-sm text-[#6A6A85]">{insight.impact}</p>
                  <button onClick={() => openDashboardTab(/connect|tracking/i.test(insight.action || '') ? 'integrations' : 'overview')} className="text-sm font-semibold text-[#0D9488] hover:text-[#0F766E]">
                    {insight.action}
                  </button>
                </div>
              )) : (
                <div className="rounded-2xl border border-[#E8E8EE] bg-[#F7F8FA] p-4 text-sm text-[#6A6A85]">
                  {tr('truthNoInsights', 'No insights generated yet.')}
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {truthView.truthBlocked && (
          <section className="rounded-3xl border border-[#FED7AA] bg-[#FFF7ED] p-6 space-y-3">
            <div className="flex items-center gap-3 text-[#C2410C]">
              <AlertCircleIcon />
              <h2 className="text-xl font-bold">{tr('truthBannerTitle', 'TRUTH downgraded confidence')}</h2>
            </div>
            <p className="text-[#9A3412]">{truthView.truthBlockReason || tr('truthBlockedReasonDefault', 'The TRUTH engine blocks metrics until ad sources are reliable enough.')}</p>
            {truthView.missingSources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {truthView.missingSources.map((source) => (
                  <span key={source} className="px-3 py-1 rounded-full text-sm bg-white border border-[#FED7AA] text-[#9A3412]">
                    {source}
                  </span>
                ))}
              </div>
            )}
            <button onClick={() => openDashboardTab('integrations')} className="px-4 py-2 rounded-xl bg-[#FF6B35] hover:bg-[#E85A28] text-white font-semibold">
              {tr('connectionsTitle', 'Connections')}
            </button>
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {truthView.financialRows.map((row) => (
            <div key={row.key} className="rounded-2xl border border-[#E8E8EE] bg-white p-5 shadow-sm space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#8A8AA3] font-semibold">{row.badge}</p>
                <h3 className="font-semibold text-[#1A1A2E] mt-1">{row.label}</h3>
              </div>
              <div className={`text-3xl font-bold ${row.tone}`}>
                {row.available ? formatCurrency(row.value, locale) : '—'}
              </div>
              <p className="text-sm text-[#6A6A85]">
                {row.available ? tr('truthModeVerified', 'Verified metrics') : tr('truthBlockedReasonDefault', 'The TRUTH engine blocks metrics until ad sources are reliable enough.')}
              </p>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-[#1A1A2E]">{tr('truthSourcesTitle', 'Data Sources Status')}</h2>
              <p className="text-sm text-[#6A6A85] mt-1">{tr('truthSourcesSubtitle', 'Each source is qualified before the profit engine is allowed to run.')}</p>
            </div>
            <button onClick={() => openDashboardTab('integrations')} className="inline-flex items-center justify-center bg-white hover:bg-[#F7F8FA] px-4 py-2 rounded-xl text-[#1A1A2E] font-semibold text-sm border border-[#E8E8EE]">
              {tr('refreshConnections', 'Refresh statuses')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {truthView.sourceCards.map((source) => (
              <div key={source.key} className="rounded-2xl border border-[#E8E8EE] bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1A1A2E]">{source.label}</h3>
                    <p className="text-sm text-[#6A6A85] mt-1">{tr('truthLastSyncLabel', 'Last sync')}: {formatDateTime(source.lastSync, locale)}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${source.connected ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#FFF7ED] text-[#C2410C]'}`}>
                    {source.connected ? tr('truthConnected', 'Connected') : tr('truthDisconnected', 'Disconnected')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#F7F8FA] p-3 border border-[#E8E8EE]">
                    <div className="text-xs text-[#8A8AA3] uppercase tracking-wide">{tr('truthCompletenessLabel', 'Completeness')}</div>
                    <div className="text-xl font-bold mt-1 text-[#1A1A2E]">{formatPercent(source.completeness)}</div>
                  </div>
                  <div className="rounded-xl bg-[#F7F8FA] p-3 border border-[#E8E8EE]">
                    <div className="text-xs text-[#8A8AA3] uppercase tracking-wide">{tr('truthReliabilityLabel', 'Reliability')}</div>
                    <div className="text-xl font-bold mt-1 text-[#1A1A2E]">{formatPercent(source.reliability)}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#6A6A85]">{source.source ? `Source: ${source.source}` : 'Source: —'}</span>
                  <button onClick={() => openDashboardTab('integrations')} className="font-semibold text-[#0D9488] hover:text-[#0F766E]">
                    {source.connected ? 'Manage' : 'Connect'}
                  </button>
                </div>

                {source.error && <p className="text-sm text-[#C2410C]">{source.error}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-[#E8E8EE] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircleIcon className="text-[#FF6B35]" />
              <div>
                <h2 className="text-2xl font-bold text-[#1A1A2E]">{tr('truthAnomaliesTitle', 'Anomalies')}</h2>
                <p className="text-sm text-[#6A6A85] mt-1">{tr('truthErrorTooltip', 'Platform is over/under reporting revenue')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {truthView.anomalies.length > 0 ? truthView.anomalies.slice(0, 4).map((anomaly, index) => (
                <div key={`${anomaly.type}-${index}`} className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FEF3C7] text-[#92400E]">
                      {anomaly.severity}
                    </span>
                    <span className="text-sm text-[#8A8AA3]">{anomaly.platform}</span>
                  </div>
                  <p className="font-semibold text-[#1A1A2E]">{anomaly.message}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-[#D1FAE5] bg-[#ECFDF5] p-4 flex items-start gap-3">
                  <CheckCircleIcon className="text-[#059669] mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-[#065F46]">{tr('truthNoAnomalies', 'No contradictions detected right now.')}</h3>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[#E8E8EE] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="text-[#0D9488]" />
              <div>
                <h2 className="text-2xl font-bold text-[#1A1A2E]">{tr('truthAlertsTitle', 'Notifications')}</h2>
                <p className="text-sm text-[#6A6A85] mt-1">{tr('truthInsightAction', 'Action')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {truthView.alerts.length > 0 ? truthView.alerts.slice(0, 4).map((alert, index) => (
                <div key={`${alert}-${index}`} className="rounded-2xl border border-[#E8E8EE] bg-[#F7F8FA] p-4">
                  <p className="font-semibold text-[#1A1A2E]">{alert}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-[#E8E8EE] bg-[#F7F8FA] p-4 text-sm text-[#6A6A85]">
                  {tr('truthNoAlerts', 'No critical alerts right now.')}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 pb-12">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-[#1A1A2E]">{tr('truthTableTitle', 'Campaign Truth Table')}</h2>
              <p className="text-sm text-[#6A6A85] mt-1">{tr('truthTableSubtitle', 'Each row compares what platforms report versus business reality.')}</p>
            </div>
            <span className="text-sm text-[#8A8AA3]">{truthView.campaigns.length} {tr('truthCampaignRows', 'campaigns')}</span>
          </div>

          {truthView.campaigns.length === 0 ? (
            <div className="rounded-2xl border border-[#E8E8EE] bg-white p-6 text-[#6A6A85] shadow-sm">
              {tr('truthNoRows', 'No campaigns available for this range yet. Connect Shopify and add UTM tracking to feed TRUTH.')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E8E8EE] bg-white shadow-sm">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#F7F8FA] text-[#8A8AA3] text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-semibold">{tr('truthColCampaign', 'Campaign Name')}</th>
                    <th className="px-6 py-4 font-semibold text-right">{tr('truthColRevenueReal', 'Revenue (REAL)')}</th>
                    <th className="px-6 py-4 font-semibold text-right">{tr('truthColSpend', 'Spend ($)')}</th>
                    <th className="px-6 py-4 font-semibold text-right">{tr('truthColProfitReal', 'Profit (REAL)')}</th>
                    <th className="px-6 py-4 font-semibold text-right">{tr('truthColRoasReal', 'ROAS (REAL)')}</th>
                    <th className="px-6 py-4 font-semibold text-right">{tr('truthColStatus', 'Status')}</th>
                    <th className="px-6 py-4 font-semibold text-right">{tr('truthInsightAction', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {truthView.campaigns.map((campaign) => {
                    const profitValue = campaign?.profit_real
                    const negative = Number(profitValue) < 0
                    return (
                      <tr key={`${campaign.platform}-${campaign.campaign_id || campaign.campaign_name}`} className="hover:bg-[#FAFAFC] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${negative ? 'bg-[#FF6B35]' : 'bg-[#0D9488]'}`} />
                            <div>
                              <div className="font-medium text-[#1A1A2E]">{campaign.campaign_name}</div>
                              <div className="text-xs text-[#8A8AA3]">{campaign.platform}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[#1A1A2E]">{formatCurrency(campaign.revenue_real, locale)}</td>
                        <td className="px-6 py-4 text-right font-mono text-[#FF6B35]">{formatCurrency(campaign.spend, locale)}</td>
                        <td className={`px-6 py-4 text-right font-mono font-bold ${negative ? 'text-[#DC2626]' : 'text-[#0D9488]'}`}>
                          {profitValue === null || profitValue === undefined ? '—' : formatCurrency(profitValue, locale)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[#1A1A2E]">
                          {campaign?.roas_real ? `${Number(campaign.roas_real).toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${campaign?.status === 'PROFITABLE' ? 'bg-[#D1FAE5] text-[#065F46]' : campaign?.status === 'LOSS' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
                            {campaign?.status || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleCampaignAction(campaign)} className="px-3 py-2 rounded-lg bg-white hover:bg-[#F7F8FA] border border-[#E8E8EE] text-[#1A1A2E] text-xs font-semibold">
                            {getCampaignActionLabel(campaign)}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
