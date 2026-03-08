import smtplib
import ssl
from email.message import EmailMessage

msg = EmailMessage()
msg["Subject"] = "Test ShopBrain AI"
msg["From"] = "shopbrainai@outlook.com"
msg["To"] = "louis-felix.gilbert@outlook.com"
msg.set_content("Bonjour Louis-felix, ceci est un test. Le systeme SMTP fonctionne.")

with smtplib.SMTP("smtp.office365.com", 587, timeout=15) as s:
    s.ehlo()
    s.starttls(context=ssl.create_default_context())
    s.ehlo()
    s.login("shopbrainai@outlook.com", "iqdwqmdaluylupjw")
    s.send_message(msg)
    print("EMAIL ENVOYE OK")
