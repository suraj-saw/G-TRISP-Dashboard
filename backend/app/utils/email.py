import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)

# Load from environment variables
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "noreply@g-trisp.local")


def send_reset_password_email(to_email: str, reset_link: str) -> None:
    """
    Sends a password reset email to the given address.
    If SMTP credentials are not configured, falls back to printing the email to the console.
    """
    subject = "G-TRISP Dashboard - Password Reset Request"
    body = f"""
    Hello,

    We received a request to reset your password for the G-TRISP Dashboard.
    Please click the link below to set a new password. This link will expire in 15 minutes.

    {reset_link}

    If you did not request this, you can safely ignore this email.

    Regards,
    G-TRISP Team
    """

    # Check if SMTP is configured
    if not SMTP_HOST or not SMTP_PORT:
        logger.warning(
            f"\n"
            f"==========================================================\n"
            f"SMTP configuration is missing. Simulating email send.\n"
            f"To: {to_email}\n"
            f"Subject: {subject}\n"
            f"Body:\n{body}\n"
            f"=========================================================="
        )
        return

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        port = int(SMTP_PORT)
        # Use SSL/TLS or StartTLS based on port or configuration. 
        # Here we use StartTLS which is common for ports like 587.
        with smtplib.SMTP(SMTP_HOST, port) as server:
            server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"Password reset email sent to {to_email}")

    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email}: {e}")
        # Fallback to logging the email if sending fails
        logger.warning(f"Failed email payload:\n{body}")
