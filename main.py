# ---------------------------
# main.py - ShopBrain AI (v1+)
# ---------------------------

import openai

# 🔑 Ta clé API OpenAI
openai.api_key = "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" # <-- remplace par ta vraie clé

# ✅ Message de confirmation
print("ShopBrain AI est prêt !")

# 💬 Test de conversation avec le modèle GPT-3.5-turbo
response = openai.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "Tu es ShopBrain AI, un assistant intelligent."},
        {"role": "user", "content": "Salut, teste-moi !"}
    ]
)

# 🔥 Affichage de la réponse générée
print(response.choices[0].message.content)

