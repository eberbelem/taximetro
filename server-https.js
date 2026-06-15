const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 5502;
const ROOT = __dirname;
const CERT_DIR = path.join(__dirname, '.certs');

// Gerar certificado auto-assinado
function generateCert() {
    if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
    const keyPath = path.join(CERT_DIR, 'key.pem');
    const certPath = path.join(CERT_DIR, 'cert.pem');
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048
        });
        fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
        fs.writeFileSync(certPath, publicKey.export({ type: 'spki', format: 'pem' }));
        console.log('✓ Certificados gerados em:', CERT_DIR);
    }
    return { key: keyPath, cert: certPath };
}

const opts = generateCert();
const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

https.createServer({
    key: fs.readFileSync(opts.key),
    cert: fs.readFileSync(opts.cert)
}, (req, res) => {
    let url = req.url.split('?')[0].split('#')[0];
    let fp = path.join(ROOT, url === '/' ? 'index.html' : url);
    const ext = path.extname(fp);
    if (!fs.existsSync(fp)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404');
        return;
    }
    res.writeHead(200, {
        'Content-Type': mime[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
    });
    fs.readFile(fp, (err, data) => {
        if (err) { res.end(''); return; }
        res.end(data);
    });
}).listen(PORT, '0.0.0.0', () => {
    const net = require('os').networkInterfaces();
    let ip = 'localhost';
    for (const name of Object.keys(net)) {
        for (const iface of net[name]) {
            if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break; }
        }
        if (ip !== 'localhost') break;
    }
    console.log('\n═══════════════════════════════════════');
    console.log('  ✅ SERVIDOR HTTPS RODANDO');
    console.log('═══════════════════════════════════════');
    console.log('  📱 No celular (mesmo Wi-Fi), abra:');
    console.log(`  🔗 https://${ip}:${PORT}`);
    console.log('');
    console.log('  ⚠️  Certificado auto-assinado:');
    console.log('     Chrome:  Clique em "Avançado" > "Prosseguir"');
    console.log('     Safari:  "Mostrar detalhes" > "Visitar site"');
    console.log('     Firefox: "Avançado" > "Aceitar risco"');
    console.log('');
    console.log('  ✅ Após aceitar, o GPS funcionará!');
    console.log('═══════════════════════════════════════\n');
});
