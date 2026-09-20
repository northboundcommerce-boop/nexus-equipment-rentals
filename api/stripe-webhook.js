import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
export const config={api:{bodyParser:false}};
async function raw(req){const chunks=[];for await(const c of req)chunks.push(c);return Buffer.concat(chunks)}
async function sendAdminEmail({customer,amount,title,paidAt}){
 if(!process.env.RESEND_API_KEY||!process.env.PAYMENT_NOTIFICATION_EMAIL)return;
 const from=process.env.PAYMENT_EMAIL_FROM||'Nexus Equipment Rentals <payments@resend.dev>';
 const html=`<div style="font-family:Arial;background:#0b0b0d;color:#fff;padding:28px"><h2 style="color:#ef202c">PAYMENT RECEIVED</h2><p><b>Customer:</b> ${customer||'Customer'}</p><p><b>Amount:</b> $${Number(amount).toFixed(2)}</p><p><b>For:</b> ${title}</p><p><b>Status:</b> PAID</p><p><b>Received:</b> ${new Date(paidAt).toLocaleString()}</p></div>`;
 await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[process.env.PAYMENT_NOTIFICATION_EMAIL],subject:`Payment Received — $${Number(amount).toFixed(2)} — Nexus Equipment Rentals`,html})});
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 let event;try{event=stripe.webhooks.constructEvent(await raw(req),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET)}catch(e){return res.status(400).send(`Webhook Error: ${e.message}`)}
 if(event.type==='checkout.session.completed'){
  const session=event.data.object,id=session.metadata?.payment_request_id;
  if(id){
   const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
   const now=new Date().toISOString();
   const {data:payment}=await admin.from('payment_requests').update({status:'paid',stripe_payment_intent_id:String(session.payment_intent||''),paid_at:now,payment_confirmed_at:now,admin_seen_at:null}).eq('id',id).select('*').single();
   if(payment){
    const {data:profile}=await admin.from('profiles').select('full_name,email').eq('id',payment.customer_id).maybeSingle();
    try{await sendAdminEmail({customer:profile?.full_name||profile?.email,amount:payment.amount,title:payment.title,paidAt:now})}catch(e){console.error('Payment email failed:',e)}
   }
  }
 }
 return res.status(200).json({received:true});
}