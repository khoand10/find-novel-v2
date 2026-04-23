module.exports = {
  apps: [
    {
      name: 'findnovel',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      out_file: "./logs/findnovel-out.log",
      error_file: "./logs/findnovel-error.log",
      merge_logs: true,
      time: true
    }
  ]
};