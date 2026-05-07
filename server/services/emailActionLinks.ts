const actionButtonStyle = "display:inline-block;padding:12px 28px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultActionLabel(label?: string): string {
  return label?.trim() || "Open in Digital Workday";
}

export function buildEmailActionBlock(actionUrl?: string, actionLabel?: string): string {
  if (!actionUrl?.trim()) return "";
  const safeUrl = escapeHtml(actionUrl.trim());
  const safeLabel = escapeHtml(defaultActionLabel(actionLabel));

  return `
              <p style="margin: 0 0 24px; text-align: center;">
                <a href="${safeUrl}" style="${actionButtonStyle}">${safeLabel}</a>
              </p>
              <p style="margin: 0 0 16px; font-size: 12px; color: #71717a; text-align: center;">
                Or copy and paste this link:<br>
                <a href="${safeUrl}" style="color: #2563eb; word-break: break-all;">${safeUrl}</a>
              </p>`;
}

export function buildEmailActionText(actionUrl?: string, actionLabel?: string): string {
  if (!actionUrl?.trim()) return "";
  return `\n\n${defaultActionLabel(actionLabel)}:\n${actionUrl.trim()}`;
}

function textBodyToHtml(textBody: string, actionUrl: string, actionLabel?: string): string {
  const paragraphs = textBody
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;color:#3f3f46;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:40px;">
              ${paragraphs}
              ${buildEmailActionBlock(actionUrl, actionLabel)}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">This email was sent by Digital Workday. Please do not reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function insertActionBlock(htmlBody: string, actionBlock: string): string {
  const footerMarker = /(\s*<tr>\s*<td style="padding:\s*20px 40px;\s*border-top:\s*1px solid #e4e4e7;\s*text-align:\s*center;">)/i;
  if (footerMarker.test(htmlBody)) {
    return htmlBody.replace(footerMarker, `
          <tr>
            <td style="padding: 0 40px 32px;">
              ${actionBlock}
            </td>
          </tr>$1`);
  }

  if (/<\/body>/i.test(htmlBody)) {
    return htmlBody.replace(/<\/body>/i, `${actionBlock}</body>`);
  }

  return `${htmlBody}${actionBlock}`;
}

export function ensureEmailActionLink(options: {
  textBody: string;
  htmlBody?: string;
  actionUrl?: string;
  actionLabel?: string;
}): { textBody: string; htmlBody?: string } {
  const actionUrl = options.actionUrl?.trim();
  if (!actionUrl) {
    return { textBody: options.textBody, htmlBody: options.htmlBody };
  }

  const textBody = options.textBody.includes(actionUrl)
    ? options.textBody
    : `${options.textBody}${buildEmailActionText(actionUrl, options.actionLabel)}`;

  if (!options.htmlBody) {
    return {
      textBody,
      htmlBody: textBodyToHtml(options.textBody, actionUrl, options.actionLabel),
    };
  }

  const htmlBody = options.htmlBody.includes(actionUrl)
    ? options.htmlBody
    : insertActionBlock(options.htmlBody, buildEmailActionBlock(actionUrl, options.actionLabel));

  return { textBody, htmlBody };
}

