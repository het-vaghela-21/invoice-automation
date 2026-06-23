module.exports = {
  apps: [
    {
      name: 'invoice-api',
      script: 'server.js',
      cwd: __dirname,
      // cluster mode: one Node.js process per CPU core, sharing port 5000.
      // PM2's load balancer (round-robin) distributes incoming requests.
      instances: 'max',
      exec_mode: 'cluster',
      // Restart automatically if the process exceeds 512 MB RSS — guards
      // against memory leaks without killing the whole cluster.
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
    },
    {
      name: 'invoice-worker',
      script: 'src/workers/start.js',
      cwd: __dirname,
      // Workers are CPU/IO-bound; run as many as you have CPU cores or Redis
      // can sustain. Adjust WORKER_CONCURRENCY so each worker doesn't spawn
      // more concurrent jobs than MongoDB/Tesseract can handle.
      instances: 2,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        WORKER_CONCURRENCY: 5,
      },
    },
  ],
};
