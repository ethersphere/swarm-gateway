interface Metric {
  type: 'counter' | 'gauge'
  name: string
  help: string
  value: number
}

const metrics: Metric[] = []

export const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8'

export function createMetric(type: Metric['type'], name: string, help: string): Metric {
  const metric = { type, name, help, value: 0 }
  metrics.push(metric)
  return metric
}

export function renderMetrics(): string {
  let text = ''
  for (const metric of metrics) {
    text += `# HELP ${metric.name} ${metric.help}\n# TYPE ${metric.name} ${metric.type}\n${metric.name} ${metric.value}\n`
  }
  return text
}
