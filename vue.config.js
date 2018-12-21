const appConfig = require('./src/server/config.js');

const express = require('express');

const fs = require('fs');
const path = require('path');



module.exports = {
    devServer: {
        before: function(app) {
            app.use('/portraits', express.static('./image_store/portraits'));
        },
        proxy: {
            "/api": {
                target: "http://localhost:8888"
            },
            "/live": {
                target: "http://localhost:8888",
                ws: true
            }
        }
    },

    lintOnSave: false
}
