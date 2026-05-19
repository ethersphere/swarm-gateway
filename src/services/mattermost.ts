import { EnvironmentVariables, getAppConfig } from "../config";

export async function sendMattermostAlert(text: string) {
  const appConfig = getAppConfig(process.env as EnvironmentVariables)
  if (!appConfig.mattermostWebhookUrl) {
    return
  }
  await fetch(appConfig.mattermostWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000)
  })
}
