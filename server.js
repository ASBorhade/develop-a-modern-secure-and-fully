const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const port = process.env.PORT || 3000;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const plans = { Essential: 49900, Momentum: 79900, Velocity: 129900 };
const pendingOrders = new Map();
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'};
const data = {
  customers: [
    { name: 'Meera Sharma', email: 'meera@email.com', plan: 'Momentum', status: 'Active', renewal: '08 Aug 2026' },
    { name: 'Rohan Patel', email: 'rohan@email.com', plan: 'Velocity', status: 'Active', renewal: '24 Jul 2026' },
    { name: 'Anaya Singh', email: 'anaya@email.com', plan: 'Essential', status: 'Active', renewal: '01 Aug 2026' }
  ],
  payments: [],
  events: []
};

function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type':type, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store'});
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}
function body(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw += c; if(raw.length > 100000) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); }); }
function rawBody(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw += c; if(raw.length > 1000000) req.destroy(); }); req.on('end', () => resolve(raw)); req.on('error', reject); }); }
function razorpayRequest(endpoint, payload) { return new Promise((resolve, reject) => { const encoded = JSON.stringify(payload); const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64'); const request = https.request({hostname:'api.razorpay.com',path:endpoint,method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(encoded)}}, response => { let raw=''; response.on('data', chunk => raw += chunk); response.on('end', () => { try { const parsed=JSON.parse(raw); response.statusCode >= 200 && response.statusCode < 300 ? resolve(parsed) : reject(new Error(parsed.error?.description || 'Razorpay order creation failed.')); } catch { reject(new Error('Invalid Razorpay response.')); } }); }); request.on('error', () => reject(new Error('Could not connect to Razorpay.'))); request.write(encoded); request.end(); }); }
function activate(order, paymentId) { const renewal = new Date(Date.now() + 30*86400000).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}); const existing = data.customers.find(c => c.email.toLowerCase() === order.email.toLowerCase()); const customer = {name: order.email.split('@')[0].replace(/[._-]/g,' ').replace(/\b\w/g, c=>c.toUpperCase()), email:order.email, plan:order.plan, status:'Active', renewal}; if(existing) Object.assign(existing, customer); else data.customers.unshift(customer); data.payments.unshift({reference:paymentId,customer:order.email,method:order.paymentMethod,amount:order.amount / 100,status:'Verified → Activated',createdAt:new Date().toISOString()}); data.events.unshift({type:'activation',message:`${order.plan} plan activated for ${order.email}`,reference:paymentId,createdAt:new Date().toISOString()}); return renewal; }
function apiSnapshot() { return { customers:data.customers, payments:data.payments.slice(0,8), events:data.events.slice(0,8), stats:{ activeSubscribers:12483 + data.customers.length - 3, monthlyRevenue:'₹84.2L', paymentsToday:364 + data.payments.length, uptime:'99.99%' } }; }

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/api/payment/order') {
    try { const {plan,address,email,paymentMethod} = await body(req); if(!plans[plan] || typeof address !== 'string' || address.trim().length < 5 || !/^\S+@\S+\.\S+$/.test(email || '')) return send(res,400,{error:'Please provide valid subscription details.'}); const order = {plan,address:address.trim(),email:email.trim().toLowerCase(),paymentMethod:paymentMethod || 'UPI',amount:plans[plan]}; if(!razorpayKeyId || !razorpayKeySecret) return send(res,200,{provider:'demo',amount:order.amount / 100}); const receipt = `nv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; const razorpayOrder = await razorpayRequest('/v1/orders',{amount:order.amount,currency:'INR',receipt,notes:{plan:order.plan,email:order.email}}); pendingOrders.set(razorpayOrder.id,order); return send(res,201,{provider:'razorpay',key:razorpayKeyId,orderId:razorpayOrder.id,amount:razorpayOrder.amount,currency:razorpayOrder.currency}); } catch(error) { return send(res,502,{error:error.message || 'Could not begin checkout.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/payment/verify') {
    try { const {razorpay_order_id:orderId,razorpay_payment_id:paymentId,razorpay_signature:signature} = await body(req); const order=pendingOrders.get(orderId); if(!order || !paymentId || !signature) return send(res,400,{error:'Unknown or incomplete payment.'}); const expected=crypto.createHmac('sha256',razorpayKeySecret).update(`${orderId}|${paymentId}`).digest('hex'); if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature))) return send(res,400,{error:'Payment signature is invalid.'}); const renewal=activate(order,paymentId); pendingOrders.delete(orderId); return send(res,200,{status:'activated',plan:order.plan,renewal,message:`Payment verified. Your ${order.plan} plan is active until ${renewal}.`}); } catch { return send(res,400,{error:'Could not verify payment.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/webhooks/razorpay') {
    const payload=await rawBody(req); const signature=req.headers['x-razorpay-signature']; if(!razorpayWebhookSecret || !signature) return send(res,400,{error:'Webhook signature missing.'}); const expected=crypto.createHmac('sha256',razorpayWebhookSecret).update(payload).digest('hex'); if(expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature))) return send(res,400,{error:'Invalid webhook signature.'}); return send(res,200,{received:true});
  }
  if (req.method === 'GET' && url.pathname === '/api/admin') return send(res, 200, apiSnapshot());
  if (req.method === 'POST' && url.pathname === '/api/checkout') {
    try {
      const {plan, price, address, email, paymentMethod} = await body(req);
      if (!['Essential','Momentum','Velocity'].includes(plan) || !Number.isInteger(Number(price)) || Number(price) < 1 || typeof address !== 'string' || address.trim().length < 5 || !/^\S+@\S+\.\S+$/.test(email || '')) return send(res, 400, {error:'Please provide valid subscription details.'});
      // In production, create a provider payment intent here. Never accept raw card data in this app.
      const reference = `NV-${crypto.randomInt(10000,99999)}`;
      const renewal = new Date(Date.now() + 30*86400000).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const payment = {reference, customer:email, method:paymentMethod || 'UPI', amount:Number(price), status:'Verified → Activated', createdAt:new Date().toISOString()};
      data.payments.unshift(payment);
      const existing = data.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
      const customer = {name: email.split('@')[0].replace(/[._-]/g,' ').replace(/\b\w/g, c=>c.toUpperCase()), email, plan, status:'Active', renewal};
      if (existing) Object.assign(existing, customer); else data.customers.unshift(customer);
      data.events.unshift({type:'activation', message:`${plan} plan activated for ${email}`, reference, createdAt:new Date().toISOString()});
      return send(res, 201, {reference, status:'activated', plan, renewal});
    } catch { return send(res, 400, {error:'Could not process this request.'}); }
  }
  if (req.method !== 'GET') return send(res, 405, {error:'Method not allowed'});
  const safePath = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^([.]{2}[\\/])+/, '');
  const file = path.join(__dirname, safePath);
  if (!file.startsWith(__dirname)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, content) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, content, mime[path.extname(file)] || 'application/octet-stream'));
}).listen(port, () => console.log(`NovaNet demo running at http://localhost:${port}`));
