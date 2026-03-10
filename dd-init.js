require('dd-trace').init({
  env: process.env.DD_ENV || 'staging',
  service: process.env.DD_SERVICE || 'aitubertw-app',
  logInjection: true,
  runtimeMetrics: true,
})

