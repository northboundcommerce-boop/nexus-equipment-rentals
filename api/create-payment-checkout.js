import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:'Stripe is not configured yet.'});
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY),admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');const {data:{user},error:ue}=await admin.auth.getUser(token);if(ue||!user)return res.status(401).json({error:'Please sign in again.'});
  const {data:p,error}=await admin.from('payment_requests').select('*').eq('id',req.body.payment_request_id).eq('customer_id',user.id).eq('status','pending').single();if(error||!p)return res.status(404).json({error:'This payment request is no longer available.'});
  const origin='https://nexusequipmentrentals.com';
  const session=await stripe.checkout.sessions.create({mode:'payment',customer_email:user.email,line_items:[{price_data:{currency:'usd',product_data:{name:p.title||'Nexus Equipment Rentals Payment',description:p.note||'Secure rental payment'},unit_amount:Math.round(Number(p.amount)*100)},quantity:1}],success_url:`${origin}/portal.html?payment=success`,cancel_url:`${origin}/portal.html?payment=cancelled`,metadata:{payment_request_id:p.id,customer_id:user.id,rental_request_id:p.rental_request_id||''},payment_intent_data:{metadata:{payment_request_id:p.id,rental_request_id:p.rental_request_id||''}}});
  await admin.from('payment_requests').update({stripe_checkout_session_id:session.id}).eq('id',p.id);return res.status(200).json({url:session.url});
 }catch(e){return res.status(500).json({error:e.message||'Could not open Stripe Checkout.'})}
}