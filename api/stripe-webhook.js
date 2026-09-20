import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
export const config={api:{bodyParser:false}};
async function raw(req){const chunks=[];for await(const c of req)chunks.push(c);return Buffer.concat(chunks)}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 let event;try{event=stripe.webhooks.constructEvent(await raw(req),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET)}catch(e){return res.status(400).send(`Webhook Error: ${e.message}`)}
 if(event.type==='checkout.session.completed'){
  const s=event.data.object,id=s.metadata?.payment_request_id;
  if(id){const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});await admin.from('payment_requests').update({status:'paid',stripe_payment_intent_id:String(s.payment_intent||''),paid_at:new Date().toISOString()}).eq('id',id)}
 }
 return res.status(200).json({received:true});
}