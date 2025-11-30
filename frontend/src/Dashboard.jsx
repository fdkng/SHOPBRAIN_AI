import React, { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function Dashboard({ user, supabase }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [notification, setNotification] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchHistory()
  }, [user])

  async function fetchHistory() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch(`${API_BASE}/products`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setHistory(data.products || [])
    } catch (e) {
      console.error(e)
    }
  }

  async function handleAnalyze() {
    setLoading(true)
    setNotification('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setNotification('Not authenticated')
        setLoading(false)
        return
      }

      const payload = { name, description, email: user.email }
      const res = await fetch(`${API_BASE}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.ok) {
        setResult(data.result)
        setNotification('Produit optimisé avec succès ✓')
        setTimeout(() => setNotification(''), 3000)
        setName('')
        setDescription('')
        fetchHistory()
      } else {
        setNotification('Erreur lors de l\'optimisation')
      }
    } catch (e) {
      setNotification('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Analyser un produit</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Nom du produit</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: T-shirt premium"
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Description actuelle</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Décrivez votre produit..."
              rows={5}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading || !name || !description}
              className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Optimisation...' : 'Analyser & Optimiser'}
            </button>
            <button
              onClick={() => { setName(''); setDescription(''); setResult(null) }}
              className="px-4 py-3 border rounded-lg hover:bg-gray-50"
            >
              Réinitialiser
            </button>
          </div>

          {notification && (
            <div className={`p-3 rounded-lg ${notification.includes('✓') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {notification}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-bold mb-4">Résultat GPT</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{result.title}</h3>
              <p className="text-gray-700 mt-2">{result.description}</p>
            </div>
            <div>
              <h4 className="font-semibold">Suggestions Cross-sell / Upsell:</h4>
              <ul className="list-disc list-inside text-gray-700 mt-2">
                {(result.cross_sell || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Historique (derniers optimisations)</h2>
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-gray-500">Aucune optimisation pour le moment</p>
          ) : (
            history.slice(0, 5).map(h => (
              <div key={h.id} className="p-4 border rounded-lg hover:bg-gray-50">
                <h4 className="font-semibold">{h.name}</h4>
                <p className="text-sm text-gray-600 mt-1">{h.original_description.substring(0, 100)}...</p>
                <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                  <div className="font-semibold">{h.optimized_title}</div>
                  <div className="text-xs text-gray-600">{h.optimized_description?.substring(0, 80)}...</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
