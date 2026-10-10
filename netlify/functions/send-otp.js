// netlify/functions/send-otp.js
// RHDocScan - Zero-Knowledge Registration OTP Dispatcher
// Delega en verify-email.js

const verifyEmail = require('./verify-email');
exports.handler = verifyEmail.handler;
