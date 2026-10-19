const serverless = require('serverless-http');
const app = require('../../index');

// Netlify Serverless Function handler with complete binary support for icons, audio, images, PDFs, and ZIPs
module.exports.handler = serverless(app, {
    binary: [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/x-icon',
        'image/vnd.microsoft.icon',
        'image/svg+xml',
        'audio/mpeg',
        'audio/mp3',
        'application/pdf',
        'application/zip',
        'application/octet-stream'
    ]
});
