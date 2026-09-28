/**
 * Sends the OTP email. Two real providers are supported, checked in order:
 *
 *   1. Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD) - sends from your own
 *      real Gmail account via an App Password. Because you're authenticated
 *      as the actual account owner (not claiming an unverified domain),
 *      Gmail lets you send to ANY recipient address for free, with no
 *      domain ownership required. This is the practical option when you
 *      don't own a domain.
 *
 *   2. Resend (RESEND_API_KEY) - cleaner "from" branding once you verify a
 *      real domain, but their shared onboarding@resend.dev sender can only
 *      deliver to the email address that owns the Resend account itself.
 *
 * If neither is configured, falls back to logging the OTP to the console -
 * fine for local development, never acceptable in production.
 */

const nodemailer = require("nodemailer");

let gmailTransporter = null;
function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return gmailTransporter;
}

function otpEmailHtml(otp) {
  return `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="color: #1A1A2E;">Sentinel AI</h2>
      <p>Your verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #E8A33D;">${otp}</p>
      <p style="color: #6B7280; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}

async function sendViaGmail(toEmail, otp) {
  const transporter = getGmailTransporter();
  await transporter.sendMail({
    from: `"Sentinel AI" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Your Sentinel AI verification code",
    html: otpEmailHtml(otp),
  });
  return { sent: true, devFallback: false, provider: "gmail" };
}

async function sendViaResend(toEmail, otp) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "Sentinel AI <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: "Your Sentinel AI verification code",
      html: otpEmailHtml(otp),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  return { sent: true, devFallback: false, provider: "resend" };
}

async function sendOtpEmail(toEmail, otp) {
  const hasGmail = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;
  const hasResend = Boolean(process.env.RESEND_API_KEY);

  if (hasGmail) {
    return sendViaGmail(toEmail, otp);
  }
  if (hasResend) {
    return sendViaResend(toEmail, otp);
  }

  console.warn(
    `[email] No email provider configured (GMAIL_USER/GMAIL_APP_PASSWORD or RESEND_API_KEY) - DEV FALLBACK ONLY. OTP for ${toEmail}: ${otp}`
  );
  return { sent: false, devFallback: true };
}

module.exports = { sendOtpEmail };
