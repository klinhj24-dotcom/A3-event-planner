import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getAppDomain(): string {
  // In production deployments REPLIT_DEPLOYMENT is set to "1"
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    return process.env.APP_DOMAIN ?? "event-mgmt.replit.app";
  }
  return process.env.REPLIT_DEV_DOMAIN ?? "localhost:8080";
}

export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `https://${getAppDomain()}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export function createAuthedClient(accessToken: string, refreshToken: string, expiryDate?: Date | null) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate ? expiryDate.getTime() : undefined,
  });
  return oauth2Client;
}

// RFC 2047 encode a subject that contains non-ASCII characters
export function encodeSubject(subject: string): string {
  if (/[^\x00-\x7F]/.test(subject)) {
    return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  }
  return subject;
}

// Encode email as base64url for Gmail API
export function makeRawEmail({
  to,
  from,
  subject,
  body,
  cc,
  bcc,
  threadId,
  replyToMessageId,
}: {
  to: string;
  from: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  threadId?: string;
  replyToMessageId?: string;
}): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc && cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    ...(bcc && bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ...(replyToMessageId ? [`In-Reply-To: ${replyToMessageId}`, `References: ${replyToMessageId}`] : []),
  ].join("\r\n");

  const email = `${headers}\r\n\r\n${body}`;
  return Buffer.from(email).toString("base64url");
}

// Encode an HTML email as base64url for Gmail API
export function makeHtmlEmail({
  to,
  from,
  subject,
  html,
  cc,
  bcc,
  threadId,
  replyToMessageId,
}: {
  to: string;
  from: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
  threadId?: string;
  replyToMessageId?: string;
}): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc && cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    ...(bcc && bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    ...(replyToMessageId ? [`In-Reply-To: ${replyToMessageId}`, `References: ${replyToMessageId}`] : []),
  ].join("\r\n");

  const email = `${headers}\r\n\r\n${html}`;
  return Buffer.from(email).toString("base64url");
}

// Build a branded HTML email from a plain-text body, optionally with a CTA button
export function buildHtmlEmail({
  recipientName,
  body,
  ctaLabel,
  ctaUrl,
}: {
  recipientName?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const escapedBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const ctaBlock = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:32px 0;">
        <a href="${ctaUrl}" style="display:inline-block;background:#7250ef;color:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.02em;">${ctaLabel}</a>
      </div>
      <p style="font-size:13px;color:#888;text-align:center;margin-top:-16px;">Or copy this link: <a href="${ctaUrl}" style="color:#7250ef;">${ctaUrl}</a></p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#0f0f0f;padding:24px 32px;text-align:center;">
          <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">THE MUSIC SPACE</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 16px;">
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0;">${escapedBody}</p>
          ${ctaBlock}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 32px;border-top:1px solid #f0f0f0;">
          <p style="font-size:12px;color:#aaa;margin:0;line-height:1.6;">The Music Space &bull; This email was sent on behalf of your studio coordinator.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Extract plain text from Gmail message parts
export function extractEmailBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      const nested = extractEmailBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

export function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}
