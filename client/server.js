const express = require('express');
const fallback = require('express-history-api-fallback');
const compression = require('compression');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(compression());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use('/api', createProxyMiddleware({
    target: 'http://localhost:3824',
    changeOrigin: true,
    pathRewrite: { '^/api': '' }
}));

app.use(express.static(`${__dirname}/build`));

app.use(fallback(`${__dirname}/build/index.html`));

const PORT = process.env.PORT || 8193;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Client server running on http://${HOST}:${PORT}`);
    console.log(`API proxy: /api -> http://localhost:3824`);
});
