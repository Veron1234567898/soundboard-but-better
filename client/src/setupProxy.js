const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://049be9b9-7c75-410e-b625-83add43ee7d1-00-jxxxnpmd2yi.sisko.replit.dev',
      changeOrigin: true,
      secure: true,
      logLevel: 'debug',
      pathRewrite: {
        '^/api': '/api'  // Ensure the /api prefix is preserved
      }
    })
  );
};
