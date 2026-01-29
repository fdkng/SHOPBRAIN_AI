"""
Action Engine - Exécution automatique d'actions
================================================
Applique automatiquement les optimisations (prix, images, stock, etc.)
Premium uniquement.
"""

import requests
from typing import Dict, List, Optional
from datetime import datetime


class ActionEngine:
    """Exécute automatiquement les actions d'optimisation"""
    
    def __init__(self, shopify_shop_url: str, shopify_access_token: str):
        self.shop_url = shopify_shop_url
        self.access_token = shopify_access_token
        self.base_url = f"https://{self.shop_url}/admin/api/2024-01"
        self.headers = {
            "X-Shopify-Access-Token": self.access_token,
            "Content-Type": "application/json"
        }
    
    def apply_price_change(self, product_id: str, new_price: float, variant_id: Optional[str] = None) -> Dict:
        """
        Applique automatiquement un changement de prix
        
        Args:
            product_id: ID du produit Shopify
            new_price: Nouveau prix à appliquer
            variant_id: ID de la variante (optionnel)
        
        Returns:
            Résultat de l'action
        """
        try:
            # Get product variants
            url = f"{self.base_url}/products/{product_id}.json"
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            product = response.json()['product']
            
            # Update variant price
            variant = product['variants'][0] if not variant_id else None
            if variant_id:
                variant = next((v for v in product['variants'] if str(v['id']) == variant_id), None)
            
            if not variant:
                return {'success': False, 'error': 'Variant not found'}
            
            update_url = f"{self.base_url}/variants/{variant['id']}.json"
            payload = {
                "variant": {
                    "id": variant['id'],
                    "price": str(new_price)
                }
            }
            
            update_response = requests.put(update_url, json=payload, headers=self.headers)
            update_response.raise_for_status()
            
            return {
                'success': True,
                'product_id': product_id,
                'variant_id': variant['id'],
                'old_price': variant['price'],
                'new_price': new_price,
                'timestamp': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def change_main_image(self, product_id: str, image_url: str) -> Dict:
        """
        Change l'image principale du produit
        
        Args:
            product_id: ID du produit
            image_url: URL de la nouvelle image
        
        Returns:
            Résultat de l'action
        """
        try:
            url = f"{self.base_url}/products/{product_id}/images.json"
            payload = {
                "image": {
                    "src": image_url,
                    "position": 1  # Image principale
                }
            }
            
            response = requests.post(url, json=payload, headers=self.headers)
            response.raise_for_status()
            
            return {
                'success': True,
                'product_id': product_id,
                'new_image': image_url,
                'timestamp': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def update_inventory(self, product_id: str, inventory_quantity: int) -> Dict:
        """
        Met à jour le stock du produit
        
        Args:
            product_id: ID du produit
            inventory_quantity: Nouvelle quantité
        
        Returns:
            Résultat de l'action
        """
        try:
            # Get inventory item ID
            url = f"{self.base_url}/products/{product_id}.json"
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            product = response.json()['product']
            
            inventory_item_id = product['variants'][0]['inventory_item_id']
            
            # Get inventory levels
            inv_url = f"{self.base_url}/inventory_levels.json?inventory_item_ids={inventory_item_id}"
            inv_response = requests.get(inv_url, headers=self.headers)
            inv_response.raise_for_status()
            location_id = inv_response.json()['inventory_levels'][0]['location_id']
            
            # Set inventory
            set_url = f"{self.base_url}/inventory_levels/set.json"
            payload = {
                "location_id": location_id,
                "inventory_item_id": inventory_item_id,
                "available": inventory_quantity
            }
            
            set_response = requests.post(set_url, json=payload, headers=self.headers)
            set_response.raise_for_status()
            
            return {
                'success': True,
                'product_id': product_id,
                'new_quantity': inventory_quantity,
                'timestamp': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def update_product_content(self, product_id: str, title: Optional[str] = None, 
                              description: Optional[str] = None) -> Dict:
        """
        Met à jour le titre et/ou la description
        
        Args:
            product_id: ID du produit
            title: Nouveau titre (optionnel)
            description: Nouvelle description HTML (optionnel)
        
        Returns:
            Résultat de l'action
        """
        try:
            url = f"{self.base_url}/products/{product_id}.json"
            payload = {"product": {}}
            
            if title:
                payload["product"]["title"] = title
            if description:
                payload["product"]["body_html"] = description
            
            response = requests.put(url, json=payload, headers=self.headers)
            response.raise_for_status()
            
            return {
                'success': True,
                'product_id': product_id,
                'updated_title': bool(title),
                'updated_description': bool(description),
                'timestamp': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def execute_optimization_plan(self, optimization_plan: List[Dict]) -> Dict:
        """
        Exécute un plan d'optimisation complet avec plusieurs actions
        
        Args:
            optimization_plan: Liste d'actions à exécuter
            Format: [
                {'action': 'price', 'product_id': '123', 'new_price': 29.99},
                {'action': 'content', 'product_id': '456', 'title': '...', 'description': '...'},
                {'action': 'image', 'product_id': '789', 'image_url': '...'}
            ]
        
        Returns:
            Résumé des actions exécutées
        """
        results = {
            'total_actions': len(optimization_plan),
            'successful': 0,
            'failed': 0,
            'details': []
        }
        
        for action in optimization_plan:
            action_type = action.get('action')
            product_id = action.get('product_id')
            
            result = None
            
            if action_type == 'price':
                result = self.apply_price_change(product_id, action.get('new_price'))
            
            elif action_type == 'content':
                result = self.update_product_content(
                    product_id, 
                    action.get('title'), 
                    action.get('description')
                )
            
            elif action_type == 'image':
                result = self.change_main_image(product_id, action.get('image_url'))
            
            elif action_type == 'inventory':
                result = self.update_inventory(product_id, action.get('quantity'))
            
            if result and result.get('success'):
                results['successful'] += 1
            else:
                results['failed'] += 1
            
            results['details'].append(result)
        
        results['timestamp'] = datetime.utcnow().isoformat()
        return results
    
    def schedule_actions(self, actions: List[Dict], execute_at: str) -> Dict:
        """
        Programme des actions à exécuter plus tard (Premium)
        
        Args:
            actions: Liste d'actions
            execute_at: ISO timestamp d'exécution
        
        Returns:
            Confirmation de programmation
        """
        # TODO: Implémenter avec une queue/scheduler (Celery, Redis, etc.)
        return {
            'scheduled': True,
            'action_count': len(actions),
            'execute_at': execute_at,
            'job_id': f"job_{datetime.utcnow().timestamp()}"
        }
