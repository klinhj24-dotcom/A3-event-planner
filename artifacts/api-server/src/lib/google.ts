import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;

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

// Encode email as base64url for Gmail API
export function makeRawEmail({
  to,
  from,
  subject,
  body,
  threadId,
  replyToMessageId,
}: {
  to: string;
  from: string;
  subject: string;
  body: string;
  threadId?: string;
  replyToMessageId?: string;
}): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ...(replyToMessageId ? [`In-Reply-To: ${replyToMessageId}`, `References: ${replyToMessageId}`] : []),
  ].join("\r\n");

  const email = `${headers}\r\n\r\n${body}`;
  return Buffer.from(email).toString("base64url");
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
