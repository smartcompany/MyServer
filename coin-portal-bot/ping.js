const fetch = require("node-fetch");

const targetUrl = "https://coinpang.org";

async function ping() {
  try {
    const start = Date.now();
    const res = await fetch(targetUrl);
    const end = Date.now();
    console.log(`[${new Date().toISOString()}] ${targetUrl} - ${res.status} (${end - start}ms)`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
  }
}

setInterval(ping, 5 * 60 * 1000);
ping();