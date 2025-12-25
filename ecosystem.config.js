module.exports = {
  apps: [
    {
      name: 'nextjs-server',
      script: 'npm',
      args: 'start',
      cwd: '/home/smart/project/home',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/nextjs-error.log',
      out_file: './logs/nextjs-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      instances: 1
    },
    {
      name: 'my-bot',
      script: 'my-bot.js',
      cwd: '/home/smart/project/ai_chat',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/my-bot-error.log',
      out_file: './logs/my-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      instances: 1
    }
  ]
};

