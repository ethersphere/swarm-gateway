import { EnvironmentVariables, getAppConfig } from '../config'
import { logger } from '../logger'

export async function sendMattermostAlert(text: string) {
  const appConfig = getAppConfig(process.env as EnvironmentVariables)
  if (appConfig.mattermostStdout) {
    logger.info(`mattermost alert:\n${text}`)
  }
  if (!appConfig.mattermostWebhookUrl) {
    return
  }
  await fetch(appConfig.mattermostWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  }).catch(error => {
    console.error('Failed to send Mattermost alert:', error)
  })
}
