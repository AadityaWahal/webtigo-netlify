const serverless = require('serverless-http');
const app = require('../../index');

module.exports.handler = serverless(app, {
    binary: ['image/png', 'image/jpeg', 'image/jpg', 'audio/mpeg']
});
