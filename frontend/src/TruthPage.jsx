import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from './LanguageContext'
import { supabase } from './supabaseClient'

const API_URL = 'https://shopbrain-backend.onrender.com'

const formatCurrency = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric)
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
  const { language } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadTruth = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError('')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expired')

      const response = await fetch(`${API_URL}/api/truth/dashboard?range=30d`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || `HTTP ${response.status}`)
      }

      setData(payload)
    } catch (err) {
      setError(err.message || 'Unable to load Truth Engine')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadTruth()
  }, [])

  const truthView = useMemo(() => {
    const summary = data?.summary || {}
    const profitEngine = data?.profit_engine || {}
    const sourceCards = Object.entries(data?.data_sources_status || {}).map(([key, source]) => ({
      key,
      label: source?.name || key,
      connected: Boolean(source?.connected),
      lastSync: source?.last_sync || null,
      completeness: Number(source?.completeness || 0),
      reliability: Number(source?.reliability || 0),
      error: source?.error || '',
    }))

    const financialRows = [
      {
        key: 'revenue',
        label: 'Revenue',
        value: summary?.total_revenue_real,
        color: 'text-emerald-400',
        badge: 'Shopify',
        available: Number.isFinite(Number(summary?.total_revenue_real)),
      },
      {
        key: 'ads',
        label: 'Ad Spend',
        value: summary?.total_ad_spend,
        color: 'text-red-400',
        badge: 'Meta / TikTok / Google',
        available: Number.isFinite(Number(summary?.total_ad_spend)),
      },
      {
        key: 'cogs',
        label: 'COGS',
        value: summary?.total_cogs,
        color: 'text-zinc-300',
        badge: data?.system_flags?.cost_inputs?.cogs_present ? 'Verified input' : 'Missing',
        available: summary?.total_cogs !== null && summary?.total_cogs !== undefined,
      },
      {
        key: 'fees',
        label: 'Fees',
        value: summary?.total_fees,
        color: 'text-orange-400',
        badge: data?.system_flags?.cost_inputs?.fees_present ? 'Verified input' : 'Missing',
        available: summary?.total_fees !== null && summary?.total_fees !== undefined,
      },
    ]

    return {
      summary,
      profitEngine,
      truthScore: Number(data?.truth_score?.value || 0),
      truthLabel: data?.truth_score?.label || 'UNVERIFIED',
      financialRows,
      sourceCards,
      campaigns: Array.isArray(data?.campaigns) ? data.campaigns : [],
      insights: Array.isArray(data?.insights) ? data.insights : [],
      alerts: Array.isArray(data?.alerts) ? data.alerts : [],
      anomalies: Array.isArray(data?.anomalies) ? data.anomalies : [],
      metricMode: data?.system_flags?.metric_mode || 'hidden',
      truthBlocked: Boolean(data?.truth_block?.allowed === false),
      truthBlockReason: data?.truth_block?.reason || '',
      missingSources: data?.truth_block?.missing_sources || [],
    }
  }, [data])

  const navigateToDashboard = () => {
    window.location.hash = '#dashboard'
  }

  const openDashboardTab = (tab) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboardRouteTab', tab)
    }
    window.location.hash = '#dashboard'
  }

  const handleCampaignAction = (campaign) => {
    const roas = Number(campaign?.roas_real)
    const errorPercent = Math.abs(Number(campaign?.error_percent || 0))
    if (!Number.isFinite(roas)) return openDashboardTab('integrations')
    if (roas < 1) return openDashboardTab('analysis')
    if (errorPercent >= 20) return openDashboardTab('integrations')
    return openDashboardTab('overview')
  }

  const getCampaignActionLabel = (campaign) => {
    const roas = Number(campaign?.roas_real)
    const errorPercent = Math.abs(Number(campaign?.error_percent || 0))
    if (!Number.isFinite(roas)) return 'Connect source'
    if (roas < 1) return 'Reduce budget'
    if (errorPercent >= 20) return 'Check tracking'
    if (roas > 2) return 'Scale carefully'
    return 'View campaign'
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#333] border-t-[#FF6B35] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white selection:bg-[#FF6B35]/30">
      <div className="sticky top-0 z-50 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button onClick={navigateToDashboard} className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white">
              <ArrowLeftIcon />
            </button>
            <div>
              <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Truth Engine</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-lg tracking-tight">{truthView.truthLabel}</span>
                <span className="text-sm text-white/50">Score {truthView.truthScore}%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadTruth({ silent: true })}
              disabled={refreshing}
              className="text-xs font-semibold px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all inline-flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshIcon className={refreshing ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
            <button onClick={navigateToDashboard} className="text-xs font-semibold px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-12 space-y-10">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="pt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${truthView.truthBlocked ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'}`}>
              <span className={`w-2 h-2 rounded-full ${truthView.truthBlocked ? 'bg-red-400' : 'bg-emerald-400'}`} />
              {truthView.truthBlocked ? 'Truth blocked' : 'Real data synced'}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
              {truthView.summary?.orders_count ?? 0} orders · {truthView.summary?.campaign_count ?? 0} campaigns
            </span>
          </div>

          <div className="grid lg:grid-cols-[1.4fr_0.9fr] gap-6">
            <div className="rounded-3xl border border-white/10 bg-[#111214] p-8">
              <p className="text-sm uppercase tracking-[0.2em] text-white/35 mb-4">Real profit</p>
              <div className={`text-5xl md:text-6xl font-extrabold tracking-tight ${Number(truthView.profitEngine?.value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {truthView.profitEngine?.value === null || truthView.profitEngine?.value === undefined ? 'Blocked' : formatCurrency(truthView.profitEngine.value)}
              </div>
              <p className="text-white/60 text-lg mt-4 max-w-2xl">
                {truthView.profitEngine?.warning || 'Profit is calculated strictly from connected data and verified cost inputs.'}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
                <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide">Confidence</p>
                  <p className="text-2xl font-bold mt-2">{Number(truthView.profitEngine?.confidence || 0)}%</p>
                </div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide">ROAS</p>
                  <p className="text-2xl font-bold mt-2">{truthView.summary?.real_roas ? `${Number(truthView.summary.real_roas).toFixed(2)}x` : '—'}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide">Unattributed</p>
                  <p className="text-2xl font-bold mt-2">{truthView.summary?.unattributed_orders ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide">Mode</p>
                  <p className="text-2xl font-bold mt-2 capitalize">{truthView.metricMode}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#111214] p-6 space-y-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/35">AI analyst</p>
                <h2 className="text-2xl font-bold mt-2">Short direct insights</h2>
              </div>

              {truthView.insights.length > 0 ? truthView.insights.slice(0, 3).map((insight, index) => (
                <div key={`${insight.problem}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-2">
                  <p className="text-white font-semibold">{insight.problem}</p>
                  <p className="text-sm text-white/60">{insight.impact}</p>
                  <button
                    onClick={() => openDashboardTab(/connect|tracking/i.test(insight.action || '') ? 'integrations' : 'overview')}
                    className="text-sm font-semibold text-[#FF6B35] hover:text-[#FF8B60] transition-colors"
                  >
                    {insight.action}
                  </button>
                </div>
              )) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-white/60 text-sm">
                  No AI insight yet. Connect more verified sources to unlock sharper decisions.
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        )}

        {truthView.truthBlocked && (
          <section className="rounded-3xl border border-red-500/20 bg-red-500/8 p-6 space-y-3">
            <div className="flex items-center gap-3 text-red-300">
              <AlertCircleIcon />
              <h2 className="text-xl font-bold">Truth is blocked</h2>
            </div>
            <p className="text-white/70">{truthView.truthBlockReason || 'At least one paid source must be connected before real profit can be verified.'}</p>
            {truthView.missingSources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {truthView.missingSources.map((source) => (
                  <span key={source} className="px-3 py-1 rounded-full text-sm bg-white/5 border border-white/10 text-white/75">
                    {source}
                  </span>
                ))}
              </div>
            )}
            <button onClick={() => openDashboardTab('integrations')} className="px-4 py-2 rounded-xl bg-[#FF6B35] hover:bg-[#E85A28] text-white font-semibold">
              Open connections
            </button>
          </section>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Connected data sources</h2>
            <p className="text-white/50 text-sm mt-1">Only real synced sources appear here.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {truthView.sourceCards.map((source) => (
              <div key={source.key} className="rounded-2xl border border-white/10 bg-[#111214] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{source.label}</h3>
                    <p className="text-sm text-white/45 mt-1">Last sync: {formatDateTime(source.lastSync, language === 'fr' ? 'fr-FR' : 'en-US')}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${source.connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-orange-500/15 text-orange-300'}`}>
                    {source.connected ? 'Connected' : 'Needs action'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
                    <div className="text-xs text-white/40 uppercase tracking-wide">Coverage</div>
                    <div className="text-xl font-bold mt-1">{Math.round(source.completeness)}%</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-3 border border-white/5">
                    <div className="text-xs text-white/40 uppercase tracking-wide">Reliability</div>
                    <div className="text-xl font-bold mt-1">{Math.round(source.reliability)}%</div>
                  </div>
                </div>

                {source.error && <p className="text-sm text-red-300">{source.error}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Where your money goes</h2>
            <p className="text-white/50 text-sm mt-1">Numbers appear only when they are available in the backend truth payload.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {truthView.financialRows.map((row) => (
              <div key={row.key} className="rounded-2xl border border-white/10 bg-[#111214] p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-white/90">{row.label}</h3>
                  <span className="text-[11px] uppercase tracking-wide text-white/40">{row.badge}</span>
                </div>
                <div className={`text-3xl font-bold ${row.color}`}>
                  {row.available ? formatCurrency(row.value) : 'Missing'}
                </div>
                <p className="text-sm text-white/50">
                  {row.available ? 'Verified amount from synced sources or configured cost inputs.' : 'This amount is not shown because no verified value is available yet.'}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <AlertCircleIcon className="text-red-400" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Detected problems</h2>
              <p className="text-white/50 text-sm mt-1">Issues come from anomalies and backend truth checks.</p>
            </div>
          </div>

          {(truthView.anomalies.length > 0 || truthView.alerts.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {truthView.anomalies.slice(0, 4).map((anomaly, index) => (
                <div key={`${anomaly.type}-${index}`} className="rounded-2xl border border-red-500/20 bg-red-500/8 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-red-500/15 text-red-300">
                      {anomaly.severity}
                    </span>
                    <span className="text-sm text-white/45">{anomaly.platform}</span>
                  </div>
                  <p className="text-lg font-semibold">{anomaly.message}</p>
                  <button onClick={() => openDashboardTab('integrations')} className="text-sm font-semibold text-[#FF6B35] hover:text-[#FF8B60]">
                    Check campaign
                  </button>
                </div>
              ))}
              {truthView.alerts.slice(0, Math.max(0, 4 - truthView.anomalies.length)).map((alert, index) => (
                <div key={`${alert}-${index}`} className="rounded-2xl border border-orange-500/20 bg-orange-500/8 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-orange-500/15 text-orange-300">
                      Alert
                    </span>
                  </div>
                  <p className="text-lg font-semibold">{alert}</p>
                  <button onClick={() => openDashboardTab('overview')} className="text-sm font-semibold text-[#FF6B35] hover:text-[#FF8B60]">
                    View product
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-6 flex items-start gap-3">
              <CheckCircleIcon className="text-emerald-300 mt-0.5" />
              <div>
                <h3 className="font-semibold text-emerald-200">No critical contradiction detected</h3>
                <p className="text-sm text-white/60 mt-1">The current connected data does not expose a major Truth conflict right now.</p>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 pb-12">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Campaign truth table</h2>
            <p className="text-white/50 text-sm mt-1">Campaign rows are built from real ads spend and Shopify-attributed revenue.</p>
          </div>

          {truthView.campaigns.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#111214] p-6 text-white/60">
              No campaign data is available yet. Connect Shopify and at least one paid source to unlock the truth table.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#111214]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Campaign</th>
                    <th className="px-6 py-4 font-semibold text-right">Revenue</th>
                    <th className="px-6 py-4 font-semibold text-right">Spend</th>
                    <th className="px-6 py-4 font-semibold text-right">Profit</th>
                    <th className="px-6 py-4 font-semibold text-right">ROAS</th>
                    <th className="px-6 py-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {truthView.campaigns.map((campaign) => {
                    const profitValue = campaign?.profit_real
                    const negative = Number(profitValue) < 0
                    return (
                      <tr key={`${campaign.platform}-${campaign.campaign_id || campaign.campaign_name}`} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${negative ? 'bg-red-500' : 'bg-emerald-500'}`} />
                            <div>
                              <div className="font-medium text-white/90">{campaign.campaign_name}</div>
                              <div className="text-xs text-white/45">{campaign.platform}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-white/80">{formatCurrency(campaign.revenue_real)}</td>
                        <td className="px-6 py-4 text-right font-mono text-red-300">{formatCurrency(campaign.spend)}</td>
                        <td className={`px-6 py-4 text-right font-mono font-bold ${negative ? 'text-red-400' : 'text-emerald-400'}`}>
                          {formatCurrency(profitValue)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-white/75">
                          {campaign?.roas_real ? `${Number(campaign.roas_real).toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleCampaignAction(campaign)}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold"
                          >
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
