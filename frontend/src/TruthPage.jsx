import React, { useEffect, useMemo, useState } from 'react'
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

const formatNumber = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numeric)
}

const formatPercent = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return `${numeric.toFixed(1)}%`
}

const getStatusClasses = (status) => {
  switch (status) {
    case 'LOSS':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'BREAK EVEN':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'PROFITABLE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200'
  }
}

export default function TruthPage() {
  const { t } = useTranslation()
  const [range, setRange] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRow, setSelectedRow] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true

    const loadTruth = async () => {
      try {
        setLoading(true)
        setError('')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          throw new Error(t('sessionExpiredReconnect'))
        }
        const response = await fetch(`${API_URL}/api/truth/dashboard?range=${encodeURIComponent(range)}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.detail || t('truthLoadError'))
        }
        if (alive) {
          setData(payload)
          setSelectedRow((previous) => {
            if (!previous) return payload?.campaigns?.[0] || null
            return payload?.campaigns?.find((row) => row.campaign_id === previous.campaign_id) || payload?.campaigns?.[0] || null
          })
        }
      } catch (err) {
        if (alive) {
          setError(err.message || t('truthLoadError'))
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadTruth()
    return () => {
      alive = false
    }
  }, [range, t])

  const summaryCards = useMemo(() => {
    const summary = data?.summary || {}
    return [
      { label: t('truthTotalRevenue'), value: formatCurrency(summary.total_revenue_real) },
      { label: t('truthTotalAdSpend'), value: formatCurrency(summary.total_ad_spend) },
      { label: t('truthTotalProfit'), value: formatCurrency(summary.total_profit) },
      { label: t('truthRealRoas'), value: summary.real_roas ? `${Number(summary.real_roas).toFixed(2)}x` : '—' },
    ]
  }, [data, t])

  const snippet = `<script src="/truth-utm-tracker.js" defer></script>`

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const navigateToDashboard = () => {
    window.location.hash = '#dashboard'
  }

  const navigateToProducts = () => {
    localStorage.setItem('dashboardRouteTab', 'underperforming')
    window.location.hash = '#dashboard'
  }

  const scrollToAds = () => {
    document.getElementById('truth-campaign-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const campaignRows = data?.campaigns || []
  const integrationWarnings = []
  if (data?.integrations?.meta?.connected === false) integrationWarnings.push(t('truthMetaMissing'))
  if (data?.integrations?.tiktok?.connected === false) integrationWarnings.push(t('truthTikTokMissing'))

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#1A1A2E] overflow-x-hidden">
      <div className="sticky top-0 z-30 bg-white/92 backdrop-blur-md border-b border-[#E8E8EE]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#8A8AA3] font-semibold">TRUTH</p>
              <h1 className="text-2xl md:text-3xl font-semibold">{t('truthTitle')}</h1>
              <p className="text-sm text-[#6A6A85] mt-1">{t('truthSubtitle')}</p>
            </div>
            <button
              onClick={navigateToDashboard}
              className="px-4 py-2 rounded-xl border border-[#E8E8EE] bg-white hover:bg-[#F7F8FA] text-sm font-medium"
            >
              {t('truthBackDashboard')}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={navigateToDashboard} className="px-4 py-2 rounded-full bg-white border border-[#E8E8EE] text-sm font-medium hover:bg-[#F7F8FA]">{t('truthNavDashboard')}</button>
            <button onClick={navigateToProducts} className="px-4 py-2 rounded-full bg-white border border-[#E8E8EE] text-sm font-medium hover:bg-[#F7F8FA]">{t('truthNavProducts')}</button>
            <button onClick={scrollToAds} className="px-4 py-2 rounded-full bg-white border border-[#E8E8EE] text-sm font-medium hover:bg-[#F7F8FA]">{t('truthNavAds')}</button>
            <button className="px-4 py-2 rounded-full bg-[#1A1A2E] text-white text-sm font-medium shadow-sm">{t('truthNavTruth')}</button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {integrationWarnings.length > 0 && (
          <div className="bg-white border border-[#E8E8EE] rounded-2xl p-4 md:p-5 shadow-sm">
            <p className="text-sm font-semibold mb-2">{t('truthDataCoverage')}</p>
            <div className="flex flex-wrap gap-2">
              {integrationWarnings.map((warning) => (
                <span key={warning} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  {warning}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {['7d', '30d', '90d'].map((value) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                  range === value ? 'bg-[#1A1A2E] text-white border-[#1A1A2E]' : 'bg-white text-[#4A4A68] border-[#E8E8EE] hover:bg-[#F7F8FA]'
                }`}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="text-xs text-[#8A8AA3]">{t('truthSourceNote')}</div>
        </div>

        {loading && (
          <div className="bg-white border border-[#E8E8EE] rounded-2xl p-8 shadow-sm flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-[#D8D8E2] border-t-[#FF6B35] rounded-full animate-spin" />
            <span className="text-sm text-[#6A6A85]">{t('truthLoading')}</span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-white border border-red-200 rounded-2xl p-5 text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {summaryCards.map((card) => (
                <div key={card.label} className="bg-white border border-[#E8E8EE] rounded-2xl p-5 shadow-sm">
                  <p className="text-sm text-[#8A8AA3] mb-2">{card.label}</p>
                  <p className="text-2xl font-semibold text-[#1A1A2E]">{card.value}</p>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)] gap-6 items-start">
              <div id="truth-campaign-table" className="bg-white border border-[#E8E8EE] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E8E8EE] flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{t('truthTableTitle')}</h2>
                    <p className="text-sm text-[#8A8AA3]">{t('truthTableSubtitle')}</p>
                  </div>
                  <span className="text-xs text-[#8A8AA3]">{campaignRows.length} {t('truthCampaignRows')}</span>
                </div>

                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-[1380px] w-full text-sm">
                    <thead className="bg-[#F7F8FA] text-[#6A6A85]">
                      <tr>
                        {[
                          t('truthColPlatform'),
                          t('truthColCampaign'),
                          t('truthColSpend'),
                          t('truthColClicks'),
                          t('truthColCtr'),
                          t('truthColCpc'),
                          t('truthColOrders'),
                          t('truthColConversionRate'),
                          t('truthColRevenueReal'),
                          t('truthColProfitReal'),
                          t('truthColRoasReal'),
                          t('truthColPlatformRoas'),
                          t('truthColErrorPercent'),
                          t('truthColStatus'),
                        ].map((label) => (
                          <th key={label} className="text-left font-medium px-4 py-3 whitespace-nowrap">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campaignRows.map((row) => (
                        <tr
                          key={`${row.platform}-${row.campaign_id}-${row.campaign_name}`}
                          onClick={() => setSelectedRow(row)}
                          className="border-t border-[#F0F0F5] hover:bg-[#FFF8F4] cursor-pointer transition"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">{row.platform}</td>
                          <td className="px-4 py-3 font-medium text-[#1A1A2E]">{row.campaign_name}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatCurrency(row.spend)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatNumber(row.clicks)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatPercent(row.ctr)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatCurrency(row.cpc)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatNumber(row.orders)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatPercent(row.conversion_rate)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{formatCurrency(row.revenue_real)}</td>
                          <td className={`px-4 py-3 whitespace-nowrap ${Number(row.profit_real) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(row.profit_real)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{row.roas_real ? `${Number(row.roas_real).toFixed(2)}x` : '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{row.platform_roas ? `${Number(row.platform_roas).toFixed(2)}x` : '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap" title={t('truthErrorTooltip')}>{formatPercent(row.error_percent)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${getStatusClasses(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="lg:hidden p-4 space-y-3">
                  {campaignRows.map((row) => (
                    <button
                      key={`${row.platform}-${row.campaign_id}-${row.campaign_name}`}
                      onClick={() => setSelectedRow(row)}
                      className="w-full text-left border border-[#E8E8EE] rounded-2xl p-4 bg-[#FCFCFD]"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div>
                          <p className="text-xs text-[#8A8AA3]">{row.platform}</p>
                          <p className="font-semibold text-[#1A1A2E]">{row.campaign_name}</p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold ${getStatusClasses(row.status)}`}>
                          {row.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-[#8A8AA3]">{t('truthColSpend')}</span><p className="font-medium">{formatCurrency(row.spend)}</p></div>
                        <div><span className="text-[#8A8AA3]">{t('truthColRevenueReal')}</span><p className="font-medium">{formatCurrency(row.revenue_real)}</p></div>
                        <div><span className="text-[#8A8AA3]">{t('truthColProfitReal')}</span><p className={`font-medium ${Number(row.profit_real) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(row.profit_real)}</p></div>
                        <div><span className="text-[#8A8AA3]">{t('truthColRoasReal')}</span><p className="font-medium">{row.roas_real ? `${Number(row.roas_real).toFixed(2)}x` : '—'}</p></div>
                      </div>
                    </button>
                  ))}
                </div>

                {campaignRows.length === 0 && (
                  <div className="px-5 py-10 text-center text-sm text-[#8A8AA3]">{t('truthNoRows')}</div>
                )}
              </div>

              <div className="space-y-6 xl:sticky xl:top-28">
                <div className="bg-white border border-[#E8E8EE] rounded-2xl shadow-sm p-5">
                  <h3 className="text-lg font-semibold mb-4">{t('truthInsightsTitle')}</h3>
                  <div className="space-y-2">
                    {(data?.insights || []).map((insight) => (
                      <div key={insight} className="rounded-xl bg-[#F7F8FA] px-3.5 py-3 text-sm text-[#2A2A42] border border-[#EFF1F5]">
                        {insight}
                      </div>
                    ))}
                    {(!data?.insights || data.insights.length === 0) && (
                      <div className="rounded-xl bg-[#F7F8FA] px-3.5 py-3 text-sm text-[#8A8AA3] border border-[#EFF1F5]">
                        {t('truthNoInsights')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-[#E8E8EE] rounded-2xl shadow-sm p-5">
                  <h3 className="text-lg font-semibold mb-4">{t('truthAlertsTitle')}</h3>
                  <div className="space-y-2">
                    {(data?.alerts || []).map((alert) => (
                      <div key={alert} className="rounded-xl bg-[#FFF7ED] px-3.5 py-3 text-sm text-[#9A3412] border border-[#FED7AA]">
                        {alert}
                      </div>
                    ))}
                    {(!data?.alerts || data.alerts.length === 0) && (
                      <div className="rounded-xl bg-[#F7F8FA] px-3.5 py-3 text-sm text-[#8A8AA3] border border-[#EFF1F5]">
                        {t('truthNoAlerts')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-[#E8E8EE] rounded-2xl shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-lg font-semibold">{t('truthUtmTitle')}</h3>
                      <p className="text-sm text-[#8A8AA3] mt-1">{t('truthUtmDescription')}</p>
                    </div>
                    <button onClick={copySnippet} className="px-3 py-2 rounded-xl border border-[#E8E8EE] text-sm font-medium hover:bg-[#F7F8FA]">
                      {copied ? t('truthCopied') : t('truthCopySnippet')}
                    </button>
                  </div>
                  <div className="rounded-2xl bg-[#0F172A] text-[#E2E8F0] text-xs leading-6 p-4 font-mono overflow-hidden break-all">
                    {snippet}
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-[#4A4A68] list-disc pl-5">
                    <li>{t('truthUtmStep1')}</li>
                    <li>{t('truthUtmStep2')}</li>
                    <li>{t('truthUtmStep3')}</li>
                  </ul>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {selectedRow && (
        <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] flex justify-end" onClick={() => setSelectedRow(null)}>
          <div className="w-full max-w-xl h-full bg-white border-l border-[#E8E8EE] shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[#E8E8EE] px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[#8A8AA3] font-semibold">{selectedRow.platform}</p>
                <h3 className="text-xl font-semibold text-[#1A1A2E]">{selectedRow.campaign_name}</h3>
              </div>
              <button onClick={() => setSelectedRow(null)} className="w-9 h-9 rounded-full hover:bg-[#F7F8FA] text-[#8A8AA3] hover:text-[#1A1A2E]">✕</button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  [t('truthColRevenueReal'), formatCurrency(selectedRow.revenue_real)],
                  [t('truthColSpend'), formatCurrency(selectedRow.spend)],
                  [t('truthColProfitReal'), formatCurrency(selectedRow.profit_real)],
                  [t('truthColRoasReal'), selectedRow.roas_real ? `${Number(selectedRow.roas_real).toFixed(2)}x` : '—'],
                  [t('truthColOrders'), formatNumber(selectedRow.orders)],
                  [t('truthColConversionRate'), formatPercent(selectedRow.conversion_rate)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-[#E8E8EE] p-4 bg-[#FCFCFD]">
                    <p className="text-xs text-[#8A8AA3] mb-1">{label}</p>
                    <p className="font-semibold text-[#1A1A2E]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-[#E8E8EE] p-4 bg-white">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="font-semibold text-[#1A1A2E]">{t('truthAttributionDetails')}</h4>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${getStatusClasses(selectedRow.status)}`}>{selectedRow.status}</span>
                </div>
                <div className="space-y-2 text-sm text-[#4A4A68]">
                  <p><span className="text-[#8A8AA3]">UTM Source:</span> {selectedRow.utm_source || '—'}</p>
                  <p><span className="text-[#8A8AA3]">UTM Content:</span> {selectedRow.utm_content || '—'}</p>
                  <p><span className="text-[#8A8AA3]">{t('truthColPlatformRoas')}:</span> {selectedRow.platform_roas ? `${Number(selectedRow.platform_roas).toFixed(2)}x` : '—'}</p>
                  <p title={t('truthErrorTooltip')}><span className="text-[#8A8AA3]">{t('truthColErrorPercent')}:</span> {formatPercent(selectedRow.error_percent)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E8E8EE] p-4 bg-white">
                <h4 className="font-semibold text-[#1A1A2E] mb-3">{t('truthAttributedOrdersTitle')}</h4>
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {(selectedRow.attributed_orders || []).map((order) => (
                    <div key={`${order.order_id}-${order.created_at}`} className="rounded-xl border border-[#EFF1F5] bg-[#FCFCFD] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-[#1A1A2E]">{order.order_name}</p>
                          <p className="text-xs text-[#8A8AA3]">{order.created_at ? new Date(order.created_at).toLocaleString() : '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-[#1A1A2E]">{formatCurrency(order.revenue)}</p>
                          <p className="text-xs text-[#8A8AA3]">{order.customer_email || '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!selectedRow.attributed_orders || selectedRow.attributed_orders.length === 0) && (
                    <div className="rounded-xl border border-[#EFF1F5] bg-[#FCFCFD] p-3 text-sm text-[#8A8AA3]">
                      {t('truthNoAttributedOrders')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
