#!/usr/bin/env node
// server.js — Express server that replaces Netlify Functions + static hosting.
// Run with: node server.js
// Reads PORT from env (default 8888) and serves the site + all /api/* routes.
//
// Requires a .env file (or real env vars) with Firebase + API key config.
// See .env.example for the full list.

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8888;

// ── Security headers (mirrors netlify.toml [[headers]]) ──
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Body parsing ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Netlify-function adapter ──
// Each Netlify function exports { handler(event) => { statusCode, headers, body, isBase64Encoded } }.
// This helper wraps one into an Express route handler.
function netlifyAdapter(handlerModule) {
  return async (req, res) => {
    const event = {
      httpMethod: req.method,
      headers: req.headers,
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
      queryStringParameters: req.query,
      path: req.path,
    };

    try {
      const result = await handlerModule.handler(event);
      const statusCode = result.statusCode || 200;
      if (result.headers) {
        Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
      }
      if (result.isBase64Encoded) {
        const buf = Buffer.from(result.body, 'base64');
        res.status(statusCode).send(buf);
      } else {
        res.status(statusCode).send(result.body);
      }
    } catch (err) {
      console.error('Function error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// ── Initialize Firebase Admin once before loading any function modules ──
// The Netlify functions each have `if (!admin.apps.length) admin.initializeApp(…)`
// at the top level. By initializing here first, those guards are all no-ops,
// so missing/partial env vars in individual files won't cause duplicate init errors.
const admin = require('firebase-admin');
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    console.log('Firebase Admin initialized for project:', projectId);
  } else {
    console.warn(
      'WARNING: Firebase env vars not set — API routes that need Firebase will fail.\n' +
      'Copy .env.example to .env and fill in your Firebase service account details.'
    );
    admin.initializeApp({ projectId: 'placeholder' });
  }
}

// ── Load Netlify functions and mount API routes ──
const fnDir = path.join(__dirname, 'netlify', 'functions');

const grade          = require(path.join(fnDir, 'grade.js'));
const registerRole   = require(path.join(fnDir, 'registerRole.js'));
const getPendingUsers = require(path.join(fnDir, 'getPendingUsers.js'));
const getAllUsers     = require(path.join(fnDir, 'getAllUsers.js'));
const approveUser    = require(path.join(fnDir, 'approveUser.js'));
const rejectUser     = require(path.join(fnDir, 'rejectUser.js'));
const desmosKey      = require(path.join(fnDir, 'desmosKey.js'));
const avatar         = require(path.join(fnDir, 'avatar.js'));
const updateUsername  = require(path.join(fnDir, 'Updateusername.js'));

app.all('/api/grade',           netlifyAdapter(grade));
app.all('/api/registerRole',    netlifyAdapter(registerRole));
app.all('/api/getPendingUsers', netlifyAdapter(getPendingUsers));
app.all('/api/getAllUsers',      netlifyAdapter(getAllUsers));
app.all('/api/approveUser',     netlifyAdapter(approveUser));
app.all('/api/rejectUser',      netlifyAdapter(rejectUser));
app.all('/api/desmosKey',       netlifyAdapter(desmosKey));
app.all('/api/avatar',          netlifyAdapter(avatar));
app.all('/api/updateUserName',  netlifyAdapter(updateUsername));

// ── Static files (the site itself) ──
app.use(express.static(__dirname, {
  extensions: ['html'],
  index: 'index.html',
}));

// ── Start ──
app.listen(PORT, () => {
  console.log(`TheStudyBase server running at http://localhost:${PORT}`);
});
