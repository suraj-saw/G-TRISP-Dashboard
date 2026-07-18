# backend/app/utils/email.py

"""
Email Utility Module

Provides shared helpers for sending outbound emails from the application.
Handles SMTP connections, payload construction, and provides a safe fallback 
(console logging) for local development environments where SMTP credentials 
are not configured.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

# Initialize module-level logger
logger = logging.getLogger(__name__)

# Load SMTP configuration from environment variables.
# These dictate how the application connects to the outbound mail server.
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "noreply@g-trisp.local")


def send_reset_password_email(to_email: str, reset_link: str) -> None:
    """
    Send a password reset email containing a secure token link to the user.

    If the environment lacks SMTP configuration (common in local development), 
    this function bypasses network operations and simulates the email delivery 
    by printing the payload to the application logs.

    Parameters
    ----------
    to_email : str
        The recipient's email address.
    reset_link : str
        The fully qualified URL containing the secure password reset token.

    Returns
    -------
    None
    """
    # Construct the email metadata and plain-text body
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

    # Check if essential SMTP configuration is provided.
    # If not, intercept the email and log it locally for debugging purposes.
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
        # Build the MIME multipart message structure required by modern mail clients
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        port = int(SMTP_PORT)
        
        # Establish connection to the SMTP server.
        # Use StartTLS to upgrade the insecure connection to a secure one using SSL/TLS.
        with smtplib.SMTP(SMTP_HOST, port) as server:
            server.starttls()
            
            # Authenticate with the mail server if credentials are provided
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
                
            # Dispatch the constructed MIME message
            server.send_message(msg)

        logger.info(f"Password reset email sent to {to_email}")

    except Exception as e:
        # Catch network timeouts, authentication errors, or misconfigurations
        logger.error(f"Failed to send password reset email to {to_email}: {e}")
        # Fallback to logging the email payload so the reset link isn't lost during an outage
        logger.warning(f"Failed email payload:\n{body}")