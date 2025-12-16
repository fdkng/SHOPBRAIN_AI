"""
Report Generator - Rapports automatiques
=========================================
Génère des rapports hebdomadaires (Pro) ou quotidiens (Premium) avec insights IA.
"""

import openai
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import json


class ReportGenerator:
    """Génère des rapports d'analyse automatiques"""
    
    def __init__(self, openai_api_key: str):
        self.client = openai.OpenAI(api_key=openai_api_key)
    
    def generate_weekly_report(self, analytics_data: Dict, tier: str = "pro") -> Dict:
        """
        Génère un rapport hebdomadaire (Pro+)
        
        Args:
            analytics_data: Données de performance de la semaine
            tier: pro ou premium
        
        Returns:
            Rapport structuré avec insights
        """
        total_revenue = analytics_data.get('total_revenue', 0)
        total_orders = analytics_data.get('total_orders', 0)
        top_products = analytics_data.get('top_products', [])
        weak_products = analytics_data.get('weak_products', [])
        
        prompt = f"""Analyse ces performances e-commerce de la semaine et génère un rapport exécutif:

📊 Métriques:
- Revenu total: ${total_revenue}
- Commandes: {total_orders}
- Panier moyen: ${total_revenue / total_orders if total_orders > 0 else 0:.2f}

🏆 Top 5 produits:
{json.dumps(top_products, indent=2)}

⚠️ Produits faibles:
{json.dumps(weak_products, indent=2)}

Fournis:
1. Résumé exécutif (3-4 phrases)
2. Tendances clés
3. Opportunités identifiées
4. Actions recommandées (top 3)
5. Prévisions semaine prochaine

Format: JSON structuré"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un analyste e-commerce senior qui fournit des insights actionnables."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                response_format={"type": "json_object"}
            )
            
            report_content = json.loads(response.choices[0].message.content)
            
            return {
                'report_type': 'weekly',
                'period': f"{(datetime.utcnow() - timedelta(days=7)).date()} - {datetime.utcnow().date()}",
                'generated_at': datetime.utcnow().isoformat(),
                'tier': tier,
                'metrics': {
                    'total_revenue': total_revenue,
                    'total_orders': total_orders,
                    'avg_order_value': round(total_revenue / total_orders, 2) if total_orders > 0 else 0
                },
                'content': report_content,
                'format': 'json'
            }
        
        except Exception as e:
            return {'error': str(e)}
    
    def generate_daily_report(self, analytics_data: Dict) -> Dict:
        """
        Génère un rapport quotidien détaillé (Premium uniquement)
        
        Args:
            analytics_data: Données de performance du jour
        
        Returns:
            Rapport quotidien avec alertes et actions
        """
        prompt = f"""Analyse les performances e-commerce d'aujourd'hui:

{json.dumps(analytics_data, indent=2)}

Génère un rapport quotidien avec:
1. 📈 Performance vs hier (%)
2. 🚨 Alertes urgentes (si anomalies)
3. ✅ Wins du jour
4. 🎯 Actions prioritaires pour demain
5. 💡 1 insight stratégique

JSON structuré."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un analyste e-commerce qui identifie rapidement les opportunités et problèmes."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            report_content = json.loads(response.choices[0].message.content)
            
            return {
                'report_type': 'daily',
                'date': datetime.utcnow().date().isoformat(),
                'generated_at': datetime.utcnow().isoformat(),
                'tier': 'premium',
                'content': report_content,
                'format': 'json'
            }
        
        except Exception as e:
            return {'error': str(e)}
    
    def generate_pdf_report(self, report_data: Dict) -> bytes:
        """
        Convertit le rapport en PDF (Premium)
        
        Args:
            report_data: Données du rapport
        
        Returns:
            PDF en bytes
        """
        # TODO: Implémenter avec reportlab ou weasyprint
        # Pour l'instant, retourne placeholder
        html_content = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial; padding: 20px; }}
                h1 {{ color: #333; }}
                .metric {{ background: #f0f0f0; padding: 10px; margin: 10px 0; }}
            </style>
        </head>
        <body>
            <h1>ShopBrain AI Report</h1>
            <p><strong>Type:</strong> {report_data.get('report_type')}</p>
            <p><strong>Date:</strong> {report_data.get('generated_at')}</p>
            
            <h2>Métriques</h2>
            <div class="metric">
                {json.dumps(report_data.get('metrics', {}), indent=2)}
            </div>
            
            <h2>Insights</h2>
            <pre>{json.dumps(report_data.get('content', {}), indent=2)}</pre>
        </body>
        </html>
        """
        
        # Conversion HTML -> PDF nécessiterait une librairie
        return html_content.encode('utf-8')
    
    def send_email_report(self, report_data: Dict, recipient_email: str) -> Dict:
        """
        Envoie le rapport par email (Premium)
        
        Args:
            report_data: Données du rapport
            recipient_email: Email du destinataire
        
        Returns:
            Statut de l'envoi
        """
        # TODO: Implémenter avec SendGrid, Mailgun ou AWS SES
        return {
            'sent': True,
            'recipient': recipient_email,
            'report_type': report_data.get('report_type'),
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def generate_custom_report(self, query: str, data: Dict) -> Dict:
        """
        Génère un rapport personnalisé basé sur une question (Premium)
        
        Args:
            query: Question de l'utilisateur
            data: Données disponibles
        
        Returns:
            Rapport répondant à la question
        """
        prompt = f"""Un utilisateur e-commerce demande:
"{query}"

Données disponibles:
{json.dumps(data, indent=2)}

Analyse et fournis une réponse structurée avec:
- Réponse directe
- Données pertinentes
- Visualisation suggérée
- Recommandations

JSON."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un analyste data e-commerce qui répond précisément aux questions business."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return {
                'query': query,
                'response': result,
                'generated_at': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            return {'error': str(e)}
    
    def generate_monthly_summary(self, monthly_data: Dict) -> Dict:
        """
        Résumé mensuel complet avec tendances (Premium)
        
        Args:
            monthly_data: Données du mois complet
        
        Returns:
            Rapport mensuel stratégique
        """
        prompt = f"""Analyse ce mois complet d'activité e-commerce:

{json.dumps(monthly_data, indent=2)}

Génère un rapport stratégique mensuel:
1. 🎯 Résumé exécutif
2. 📊 KPIs vs mois précédent
3. 🏆 Meilleurs performers
4. 📉 Produits à optimiser
5. 💰 Opportunités de revenus
6. 🔮 Stratégie mois prochain
7. 🎨 Insights saisonniers

JSON détaillé."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Tu es un directeur e-commerce qui fournit des analyses stratégiques complètes."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                response_format={"type": "json_object"}
            )
            
            report_content = json.loads(response.choices[0].message.content)
            
            return {
                'report_type': 'monthly',
                'month': datetime.utcnow().strftime('%B %Y'),
                'generated_at': datetime.utcnow().isoformat(),
                'tier': 'premium',
                'content': report_content
            }
        
        except Exception as e:
            return {'error': str(e)}
