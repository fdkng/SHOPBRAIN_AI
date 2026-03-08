import smtplib
import ssl
from email.message import EmailMessage

SMTP_HOST = "smtp.office365.com"
SMTP_PORT = 587
SMTP_USER = "shopbrainai@outlook.com"
SMTP_PASS = "suwwcsgzaiwvwopa"
TO_EMAIL = "louis-felix.gilbert@outlook.com"

msg = EmailMessage()
msg["Subject"] = "Test ShopBrain AI"
msg["From"] = SMTP_USER
msg["To"] = TO_EMAIL
msg.set_content("Bonjour Louis-felix, ceci est un test. Le SMTP fonctionne.")

print("1. Connexion SMTP...")
try:
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        server.ehlo()
        server.starttls(context=ssl.create_default_context())
        server.ehlo()
        print("2. Login...")
        server.login(SMTP_USER, SMTP_PASS)
        print("3. Envoi...")
        server.send_message(msg)
        print("4. SUCCES - Email envoye!")
except smtplib.SMTPAuthenticationError as e:
    print(f"ERREUR AUTH: {e}")
except Exception as e:
    print(f"ERREUR: {e}")
