# ---------------------------
# main_simulation_smart.py - ShopBrain AI simulation avancée
# ---------------------------

print("ShopBrain AI est prêt !")

# Fonction pour générer une réponse intelligente en fonction du texte
def get_smart_response(user_input):
    user_input = user_input.lower()

    # Salutations
    if any(word in user_input for word in ["bonjour", "salut", "hello", "coucou"]):
        return "Salut ! Je suis ShopBrain AI, ravi de te parler."
    
    # Ventes
    elif any(word in user_input for word in ["vente", "ventes", "chiffre d'affaire", "recette"]):
        return "Voici un résumé fictif de tes ventes : total cette semaine : 1500€, meilleur produit : T-shirt."
    
    # Produits
    elif any(word in user_input for word in ["produit", "produits", "stock", "inventaire"]):
        return "Actuellement, tu as 25 T-shirts, 10 casquettes et 5 sweatshirts en stock."
    
    # Commandes / clients
    elif any(word in user_input for word in ["commande", "client", "clients", "livraison"]):
        return "Tes dernières commandes ont été traitées, il reste 2 livraisons en attente."
    
    # Aide
    elif any(word in user_input for word in ["aide", "problème", "bug", "question"]):
        return "Pas de souci ! Je peux t'aider à vérifier ton stock, tes ventes ou tes produits."
    
    # Fin de session
    elif any(word in user_input for word in ["exit", "quit", "q"]):
        return "Au revoir !"
    
    # Réponse générique
    else:
        return "Je t'ai compris, mais je peux répondre mieux si tu précises ta demande."

# Boucle interactive
while True:
    user_input = input("\nToi: ")
    if user_input.lower() in ["exit", "quit", "q"]:
        print("ShopBrain AI: Au revoir !")
        break
    response = get_smart_response(user_input)
    print("ShopBrain AI:", response)



