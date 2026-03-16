const express = require('express');
const fallback = require('express-history-api-fallback');
const compression = require('compression');

const app = express();

app.use(compression());

app.use(express.static(`${__dirname}/build`));

app.use(fallback(`${__dirname}/build/index.html`));

const PORT = process.env.PORT || 8081;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Client server running on http://${HOST}:${PORT}`);
});
